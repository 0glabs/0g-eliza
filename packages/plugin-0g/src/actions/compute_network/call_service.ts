import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelClass,
} from "@ai16z/eliza";
import { ethers } from "ethers";
import { composeContext } from "@ai16z/eliza";
import { createZGServingNetworkBroker } from '@0glabs/0g-serving-broker'
import { zgcExtractCallInputsTemplate } from '../../templates/compute_network/extract_call_inputs';
import { generateObjectV2 } from "@ai16z/eliza";
import { ServiceCallInputsSchema, isServiceCallInputsContent } from '../../types';
import { validateZeroGConfig } from "../../enviroment";
import { OpenAI } from "openai";

export const zgcCallService: Action = {
    name: "ZGC_CALL_SERVICE",
    similes: [
        "CALL_SERVICE_ON_ZGC",
        "CALL_SERVICE_ON_ZERO_GRAVITY_COMPUTE_NETWORK",
        "CALL_SERVICE_ON_ZG",
    ],
    description: "Call a service on Zero Gravity Compute Network",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // console.log("Message:", message);
        return true;
    },
    examples: [[
        {
            user: "{{user1}}",
            content: {
                text: "call the first provider on Zero Gravity Compute Network, and the input is 'hello'",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "call the provider with the model 'gpt-4o' on Zero Gravity Compute Network, and the input is 'hello'",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "call the provider named 'chat-provider-1' on Zero Gravity Compute Network, and the input is 'hello'",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "call the first provider on Zero Gravity Compute Network, and the input is 'hello'",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "call the first provider on Zero Gravity Compute Network, and the input is 'hello'",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "call the provider with the type 'chatbot' on Zero Gravity Compute Network, and the input is 'hello'",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "call the provider with low input price on Zero Gravity Compute Network, and the input is 'hello'",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "call the provider with low output price on Zero Gravity Compute Network, and the input is 'hello'",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "call the provider with low input and output price on Zero Gravity Compute Network, and the input is 'hello'",
            },
        },
    ]],
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        console.log("ZGC_CALL_SERVICE action called");
        try {
            const memories = await runtime.messageManager.getMemories({
                roomId: message.roomId,
                count: 10,
                start: 0,
                end: Date.now(),
            });

            if (!state) {
                state = (await runtime.composeState(message)) as State;
            } else {
                state = await runtime.updateRecentMessageState(state);
            }

            const promptTemplate = zgcExtractCallInputsTemplate
                .replace("{{info}}", memories.map(m => m.content.text).join("\n"))
            const zgcExtractCallInputsContext = composeContext({
                state,
                template: promptTemplate,
            });
            // console.log("zgcExtractCallInputsContext:", zgcExtractCallInputsContext);

            const zgConfig = await validateZeroGConfig(runtime);

            const content = await generateObjectV2  ({
                runtime,
                context: zgcExtractCallInputsContext,
                modelClass: ModelClass.SMALL,
                schema: ServiceCallInputsSchema,
            });
            if (!isServiceCallInputsContent(content.object)) {
                throw new Error("Invalid content");
            }

            console.log("Your selected provider and wanted input is:", content.object);

            const provider = new ethers.JsonRpcProvider(zgConfig.ZEROG_RPC_URL);
            const signer = new ethers.Wallet(zgConfig.ZEROG_PRIVATE_KEY, provider);
            const broker = await createZGServingNetworkBroker(signer);

            const { endpoint, model } = await broker.getServiceMetadata(
                content.object.service.provider,
                content.object.service.name
            );

            const headers = await broker.getRequestHeaders(
                content.object.service.provider,
                content.object.service.name,
                content.object.input
            );

            const completion = await fetch(`${endpoint}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                body: JSON.stringify({
                    messages: [{ role: 'system', content: content.object.input }],
                    model: model,
                }),
            })

            const result = await completion.json();
            if (result.error) {
                // extract unpaid service
                // if exists unpaid service, call the unpaid service, return with tip that "You have an unpaid service, I can help you pay it, if yes, please give me the instructions maybe like 'pay the unpaid service'"

                // if not exists unpaid service, throw error
                throw new Error(`Error calling service on ZGC: ${result.error}`);
            }

            const output = result.choices[0].message.content;
            const chatID = result.id;
            if (!output) {
                throw new Error("No output received.");
            }

            console.log("Processing a response...");
            const isValid = await broker.processResponse(
                content.object.service.provider,
                content.object.service.name,
                output,
                chatID
            );
            if (!isValid) {
                throw new Error("Invalid response");
            } else {
                console.log(`Call service successfully, and the output from the service is: ${output}`);
            }

            if (callback) {
                callback({
                    text: `Call service successfully, and the output from the service is: ${output}`,
                    content: {
                        service: content.object.service,
                        input: content.object.input,
                        output: output,
                    },
                });
            }
        } catch (error) {
            console.error("Error calling service on ZGC:", error);
            if (callback) {
                callback({
                    text: `Error calling service on ZGC: ${error}`,
                });
            }
        }
    },
} as Action;
