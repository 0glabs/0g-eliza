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
import { zgcExtractDepositTemplate } from '../../templates/compute_network/extract_deposit';
import { generateObjectV2 } from "@ai16z/eliza";
import { ServiceDepositSchema, isServiceDepositContent } from '../../types';
import { validateZeroGConfig } from "../../enviroment";

export const zgcDepositFund: Action = {
    name: "ZGC_DEPOSIT_FUND",
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
        console.log("ZGC_DEPOSIT_FUND action called");
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

            const promptTemplate = zgcExtractDepositTemplate
                .replace("{{info}}", memories.map(m => m.content.text).join("\n"))
            const zgcExtractDepositContext = composeContext({
                state,
                template: promptTemplate,
            });
            // console.log("zgcExtractDepositContext:", zgcExtractDepositContext);

            const zgConfig = await validateZeroGConfig(runtime);

            const content = await generateObjectV2  ({
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

            await broker.depositFund(content.object.service.provider, Number(content.object.deposit));
            const account = await broker.getAccount(content.object.service.provider);
            console.log("Deposit successfully, the account info is as follows:", account);

            if (callback) {
                callback({
                    text: `Deposited ${content.object.deposit} A0GI to your account on ${content.object.service.provider}, and the account balance is ${account.balance} neuron (1e18 neuron = 1 A0GI)`,
                    content: {
                        service: content.object.service,
                        deposit: content.object.deposit,
                    },
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
