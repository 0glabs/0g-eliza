import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelClass,
    generateObjectV2,
} from "@ai16z/eliza";
import { ethers } from "ethers";
import { composeContext } from "@ai16z/eliza";
import { createZGServingNetworkBroker } from '@0glabs/0g-serving-broker'
import { zgcExtractDepositTemplate } from '../../templates/compute_network/extract_deposit';
import { ServiceDepositSchema, isServiceDepositContent } from '../../types';
import { validateZeroGConfig } from "../../enviroment";

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
            const zgConfig = await validateZeroGConfig(runtime);

            const promptTemplate = zgcExtractDepositTemplate
                .replace("{{info}}", memories.map(m => m.content.text).join("\n"))
            const zgcExtractDepositContext = composeContext({
                state,
                template: promptTemplate,
            });
            // console.log("zgcExtractDepositContext:", zgcExtractDepositContext);

            const content = await generateObjectV2({
                runtime,
                context: zgcExtractDepositContext,
                modelClass: ModelClass.SMALL,
                schema: ServiceDepositSchema,
            });
            if (!isServiceDepositContent(content.object)) {
                throw new Error("Invalid content");
            }
            console.log("Your selected provider and wanted deposit amount is:", content.object);

            const provider = new ethers.JsonRpcProvider(zgConfig.ZEROG_RPC_URL);
            const signer = new ethers.Wallet(zgConfig.ZEROG_PRIVATE_KEY, provider);
            const broker = await createZGServingNetworkBroker(signer);

            await broker.addAccount(content.object.service.provider, Number(content.object.deposit));
            const account = await broker.getAccount(content.object.service.provider);
            console.log("Create account on ZGC successfully, the account info is as follows:", account);
            if (callback) {
                callback({
                    text: `Created account on ${content.object.service.provider} with deposit ${content.object.deposit} A0GI, and the account balance is ${account.balance} neuron (1e18 neuron = 1 A0GI)`,
                    content: {
                        service: content.object.service,
                        deposit: content.object.deposit,
                    },
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
