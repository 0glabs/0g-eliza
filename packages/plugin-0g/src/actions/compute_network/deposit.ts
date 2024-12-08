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

export const zgcDeposit: Action = {
    name: "ZGC_DEPOSIT",
    similes: [
        "DEPOSIT_ON_ZGC",
        "DEPOSIT_ON_ZERO_GRAVITY_COMPUTE_NETWORK",
        "DEPOSIT_ON_ZG",
    ],
    description: "Deposit funds to a Zero Gravity Compute Network account",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // console.log("Message:", message);
        return true;
    },
    examples: [[
        {
            user: "{{user1}}",
            content: {
                text: "deposit 10 A0GI to my account on the first provider on Zero Gravity Compute Network",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "deposit 10 A0GI to my account on the provider with the model 'gpt-4o' on Zero Gravity Compute Network",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "deposit 10 A0GI to my account on the provider named 'chat-provider-1' on Zero Gravity Compute Network",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "depsit 10 A0GI to my account on the first provider on zgc",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "deposit 10 A0GI to my account on the first provider on zg",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "deposit 10 A0GI to my account on the provider with the type 'chatbot' on Zero Gravity Compute Network",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "deposit 10 A0GI to my account on the provider with low input price on Zero Gravity Compute Network",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "deposit 10 A0GI to my account on the provider with low output price on Zero Gravity Compute Network",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "deposit 10 A0GI to my account on the provider with low input and output price on Zero Gravity Compute Network",
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
        console.log("ZGC_DEPOSIT action called");
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
            console.log("zgcExtractServicesContext:", zgcExtractServicesContext);

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
                    text: `Deposited ${content.deposit} A0GI to my account on ${content.provider}`,
                });
            }
        } catch (error) {
            console.error("Error depositing funds to ZGC:", error);
            if (callback) {
                callback({
                    text: `Error depositing funds to ZGC: ${error}`,
                });
            }
        }
    },
} as Action;
