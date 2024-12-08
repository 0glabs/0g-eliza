import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelClass,
    ActionExample,
    generateObject,
} from "@ai16z/eliza";
import { Indexer, ZgFile } from "@0glabs/0g-ts-sdk";
import { ethers } from "ethers";
import { composeContext, settings } from "@ai16z/eliza";
import { promises as fs } from "fs";
import { MemoryManager } from "@ai16z/eliza";
import { createZGServingNetworkBroker } from '@0glabs/0g-serving-broker'
import { zgcExtractServicesTemplate } from '../../templates/compute_network/extract_service';
import { ServiceListSchema } from '../../types';
import { RuleTester } from "eslint";

export const zgcCreateAccount: Action = {
    name: "ZGC_CREATE_ACCOUNT",
    similes: [
        "CREATE_ACCOUNT_ON_ZGC",
        "CREATE_ACCOUNT_ON_ZERO_GRAVITY_COMPUTE_NETWORK",
        "CREATE_ACCOUNT_ON_ZG",
    ],
    description: "Create a new account on Zero Gravity Compute Network",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // console.log("Message:", message);
        return true;
    },
    examples: [[
        {
            user: "{{user1}}",
            content: {
                text: "create a new account on the first provider on Zero Gravity Compute Network, and I want to deposit 10 A0GI",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "create a new account on the first provider with the model 'gpt-4o' on Zero Gravity Compute Network, and I want to deposit 10 A0GI",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "create a new account on the provider named 'chat-provider-1' on Zero Gravity Compute Network, and I want to deposit 10 A0GI",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "create a new account on the first provider on zgc, and I want to deposit 10 A0GI",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "create a new account on the first provider on zg, and I want to deposit 10 A0GI",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "create a new account on the provider with the type 'chatbot' on Zero Gravity Compute Network, and I want to deposit 10 A0GI",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "create a new account on the provider with low input price on Zero Gravity Compute Network, and I want to deposit 10 A0GI",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "create a new account on the provider with low output price on Zero Gravity Compute Network, and I want to deposit 10 A0GI",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "create a new account on the provider with low input and output price on Zero Gravity Compute Network, and I want to deposit 10 A0GI",
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
        console.log("ZGC_CREATE_ACCOUNT action called");
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

            const promptTemplate = zgcExtractServicesTemplate
                .replace("{{info}}", memories.map(m => m.content.text).join("\n"))
            const zgcExtractServicesContext = composeContext({
                state,
                template: promptTemplate,
            });
            // console.log("zgcExtractServicesContext:", zgcExtractServicesContext);

            const content = await generateObject({
                runtime,
                context: zgcExtractServicesContext,
                modelClass: ModelClass.SMALL,
            });

            console.log("You selected and the deposit amount is:", content);

            const provider = new ethers.JsonRpcProvider(settings.ZEROG_EVM_RPC);
            const signer = new ethers.Wallet(settings.ZEROG_PRIVATE_KEY, provider);
            const broker = await createZGServingNetworkBroker(signer);

            await broker.depositFund(content.provider, content.deposit);

            if (callback) {
                callback({
                    text: `Created account on ${content.provider} with deposit ${content.deposit} A0GI`,
                });
            }
        } catch (error) {
            console.error("Error creating account on ZGC:", error);
            if (callback) {
                callback({
                    text: `Error creating account on ZGC: ${error}`,
                });
            }
        }
    },
} as Action;
