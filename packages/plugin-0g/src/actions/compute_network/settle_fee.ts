import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelClass,
    stringToUuid,
} from "@ai16z/eliza";
import { ethers } from "ethers";
import { composeContext } from "@ai16z/eliza";
import { createZGServingNetworkBroker } from '@0glabs/0g-serving-broker'
import { zgcExtractUnpaiedTemplate } from '../../templates/compute_network/extract_unpaied';
import { generateObjectV2 } from "@ai16z/eliza";
import { SettleFeeSchema, isSettleFeeContent } from '../../types';
import { validateZeroGConfig } from "../../enviroment";
import { OpenAI } from "openai";

const unpaidError = "Please use 'settleFee' (https://docs.0g.ai/build-with-0g/compute-network/sdk#55-settle-fees-manually) to manually settle the fee first";

export const zgcSettleFee: Action = {
    name: "ZGC_SETTLE_FEE",
    similes: [
        "SETTLE_FEE_ON_ZGC",
        "SETTLE_FEE_ON_ZERO_GRAVITY_COMPUTE_NETWORK",
        "SETTLE_FEE_ON_ZG",
    ],
    description: "Settle the fee on Zero Gravity Compute Network",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // console.log("Message:", message);
        return true;
    },
    examples: [[
        {
            user: "{{user1}}",
            content: {
                text: "settle the unpaid fee on Zero Gravity Compute Network",
            },
        },
    ],
    [
        {
            user: "{{user1}}",
            content: {
                text: "settle the fee on ZGC",
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
        console.log("ZGC_SETTLE_FEE action called");
        try {
            const memories = await runtime.messageManager.getMemories({
                roomId: message.roomId,
                count: 3,
                start: 0,
                end: Date.now(),
            });

            if (!state) {
                state = (await runtime.composeState(message)) as State;
            } else {
                state = await runtime.updateRecentMessageState(state);
            }

            const promptTemplate = zgcExtractUnpaiedTemplate
                .replace("{{info}}", memories.map(m => m.content.text).join("\n"))
            const zgcExtractUnpaiedContext = composeContext({
                state,
                template: promptTemplate,
            });
            // console.log("zgcExtractUnpaiedContext:", zgcExtractUnpaiedContext);

            const zgConfig = await validateZeroGConfig(runtime);

            const content = await generateObjectV2  ({
                runtime,
                context: zgcExtractUnpaiedContext,
                modelClass: ModelClass.SMALL,
                schema: SettleFeeSchema,
            });
            if (!isSettleFeeContent(content.object)) {
                throw new Error("Invalid content");
            }

            console.log("Unpaied service and fee:", content.object);

            const provider = new ethers.JsonRpcProvider(zgConfig.ZEROG_RPC_URL);
            const signer = new ethers.Wallet(zgConfig.ZEROG_PRIVATE_KEY, provider);
            const broker = await createZGServingNetworkBroker(signer);

            await broker.settleFee(content.object.service.provider, content.object.service.name, Number(content.object.fee));

            if (callback) {
                callback({
                    text: `Settle fee successfully`,
                    content: {
                        service: content.object.service,
                        fee: content.object.fee,
                    },
                });
            }
        } catch (error) {
            console.error("Error settle fee on ZGC:", error);
            if (callback) {
                callback({
                    text: `Error settle fee on ZGC: ${error}`,
                });
            }
        }
    },
} as Action;
