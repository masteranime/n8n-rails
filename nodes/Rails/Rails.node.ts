import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,

  NodeOperationError,
} from 'n8n-workflow';

interface RailTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  endpoint: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
  };
}

interface Rail {
  step: number;
  tool: RailTool;
  on_fail?: 'halt' | 'continue';
}

interface RailsConfig {
  rails: Rail[];
}

export class Rails implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'n8n-rails',
    name: 'rails',
    icon: 'file:rails.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{ "Force tool order: " + ($parameter["model"] || "no model") }}',
    description: 'Force deterministic tool execution order in AI agents. No skipping, no reordering.',
    defaults: {
      name: 'n8n-rails',
    },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'LLM Provider',
        name: 'provider',
        type: 'options',
        options: [
          { name: 'OpenAI', value: 'openai' },
          { name: 'Groq', value: 'groq' },
          { name: 'Custom (OpenAI-compatible)', value: 'custom' },
        ],
        default: 'openai',
        description: 'LLM provider. All must support OpenAI-compatible chat completions API.',
      },
      {
        displayName: 'API Key',
        name: 'apiKey',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        required: true,
        description: 'API key for your LLM provider',
      },
      {
        displayName: 'Base URL',
        name: 'baseUrl',
        type: 'string',
        default: 'https://api.openai.com/v1',
        description: 'OpenAI-compatible base URL. For Groq use https://api.groq.com/openai/v1',
      },
      {
        displayName: 'Model',
        name: 'model',
        type: 'string',
        default: 'gpt-4o-mini',
        description: 'Model name. e.g. gpt-4o-mini, llama-3.3-70b-versatile',
      },
      {
        displayName: 'User Message Field',
        name: 'userMessageField',
        type: 'string',
        default: 'message',
        description: 'Which input field contains the user message',
      },
      {
        displayName: 'Rails Config',
        name: 'railsConfig',
        type: 'json',
        default: '{\n  "rails": [\n    {\n      "step": 1,\n      "tool": {\n        "name": "lookup_customer",\n        "description": "Look up a customer by phone number",\n        "parameters": {\n          "type": "object",\n          "properties": {\n            "phone": { "type": "string", "description": "Phone number with country code" }\n          },\n          "required": ["phone"]\n        },\n        "endpoint": {\n          "url": "https://httpbin.org/post",\n          "method": "POST",\n          "headers": {}\n        }\n      },\n      "on_fail": "halt"\n    }\n  ]\n}',
        description: 'Define ordered tools the agent must call. Each step exposes ONLY that tool to the LLM.',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const apiKey = this.getNodeParameter('apiKey', i) as string;
        const baseUrl = this.getNodeParameter('baseUrl', i) as string;
        const model = this.getNodeParameter('model', i) as string;
        const userMessageField = this.getNodeParameter('userMessageField', i) as string;
        const railsConfigRaw = this.getNodeParameter('railsConfig', i);

        const railsConfig: RailsConfig =
          typeof railsConfigRaw === 'string'
            ? JSON.parse(railsConfigRaw)
            : (railsConfigRaw as RailsConfig);

        if (!railsConfig.rails || !Array.isArray(railsConfig.rails)) {
          throw new NodeOperationError(
            this.getNode(),
            'Rails config must contain a "rails" array',
          );
        }

        const userMessage = items[i].json[userMessageField] as string;
        if (!userMessage) {
          throw new NodeOperationError(
            this.getNode(),
            'Field "' + userMessageField + '" is missing or empty in input',
          );
        }

        const sortedRails = [...railsConfig.rails].sort((a, b) => a.step - b.step);

        const conversationHistory: any[] = [
          {
            role: 'system',
            content:
              'You are a tool-using assistant. You will be given exactly one tool per turn. You must call that tool. Use context from previous tool results to fill parameters.',
          },
          { role: 'user', content: userMessage },
        ];

        const stepResults: Array<{
          step: number;
          tool: string;
          input: any;
          output: any;
          duration_ms: number;
        }> = [];

        for (const rail of sortedRails) {
          const stepStart = Date.now();

          const llmRequest = {
            model,
            messages: conversationHistory,
            tools: [
              {
                type: 'function',
                function: {
                  name: rail.tool.name,
                  description: rail.tool.description,
                  parameters: rail.tool.parameters,
                },
              },
            ],
            tool_choice: {
              type: 'function',
              function: { name: rail.tool.name },
            },
          };

          let llmResponse: any;
          try {
            llmResponse = await this.helpers.httpRequest({
              method: 'POST',
              url: baseUrl + '/chat/completions',
              headers: {
                Authorization: 'Bearer ' + apiKey,
                'Content-Type': 'application/json',
              },
              body: llmRequest,
              json: true,
            });
          } catch (err) {
            const errMsg =
              'Step ' + rail.step + ' (' + rail.tool.name + '): LLM call failed - ' + (err as Error).message;
            if (rail.on_fail === 'continue') {
              stepResults.push({
                step: rail.step,
                tool: rail.tool.name,
                input: null,
                output: { error: errMsg },
                duration_ms: Date.now() - stepStart,
              });
              continue;
            }
            throw new NodeOperationError(this.getNode(), errMsg);
          }

          const toolCall = llmResponse.choices &&
            llmResponse.choices[0] &&
            llmResponse.choices[0].message &&
            llmResponse.choices[0].message.tool_calls &&
            llmResponse.choices[0].message.tool_calls[0];

          if (!toolCall) {
            const errMsg =
              'Step ' + rail.step + ' (' + rail.tool.name + '): LLM did not return a tool call';
            if (rail.on_fail === 'continue') {
              stepResults.push({
                step: rail.step,
                tool: rail.tool.name,
                input: null,
                output: { error: errMsg },
                duration_ms: Date.now() - stepStart,
              });
              continue;
            }
            throw new NodeOperationError(this.getNode(), errMsg);
          }

          let toolArgs: any;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch (err) {
            throw new NodeOperationError(
              this.getNode(),
              'Step ' + rail.step + ': LLM returned invalid JSON arguments: ' + toolCall.function.arguments,
            );
          }

          let toolOutput: any;
          try {
            toolOutput = await this.helpers.httpRequest({
              method: rail.tool.endpoint.method,
              url: rail.tool.endpoint.url,
              headers: rail.tool.endpoint.headers || {},
              body: rail.tool.endpoint.method !== 'GET' ? toolArgs : undefined,
              qs: rail.tool.endpoint.method === 'GET' ? toolArgs : undefined,
              json: true,
            });
          } catch (err) {
            const errMsg =
              'Step ' + rail.step + ' (' + rail.tool.name + '): Tool execution failed - ' + (err as Error).message;
            if (rail.on_fail === 'continue') {
              stepResults.push({
                step: rail.step,
                tool: rail.tool.name,
                input: toolArgs,
                output: { error: errMsg },
                duration_ms: Date.now() - stepStart,
              });
              continue;
            }
            throw new NodeOperationError(this.getNode(), errMsg);
          }

          stepResults.push({
            step: rail.step,
            tool: rail.tool.name,
            input: toolArgs,
            output: toolOutput,
            duration_ms: Date.now() - stepStart,
          });

          conversationHistory.push({
            role: 'assistant',
            tool_calls: [toolCall],
          });
          conversationHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolOutput),
          });
        }

        returnData.push({
          json: {
            success: true,
            steps: stepResults,
            final_output: stepResults.length > 0 ? stepResults[stepResults.length - 1].output : null,
            total_duration_ms: stepResults.reduce((sum, s) => sum + s.duration_ms, 0),
          },
          pairedItem: { item: i },
        });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { success: false, error: (error as Error).message },
            pairedItem: { item: i },
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
