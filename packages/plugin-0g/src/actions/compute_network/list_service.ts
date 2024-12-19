import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ActionExample,
} from "@ai16z/eliza";
import { ethers } from "ethers";
import { createZGServingNetworkBroker } from "@0glabs/0g-serving-broker";
import { stringToUuid } from "@ai16z/eliza";
import { validateZeroGConfig } from "../../enviroment";
export const zgcListServices: Action = {
    name: "ZGC_LIST_SERVICES",
    similes: [
        "LIST_SERVICES_ON_ZGC",
        "LIST_SERVICES_ON_ZERO_GRAVITY_COMPUTE_NETWORK",
    ],
    description: "List all services on Zero Gravity Compute Network",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // console.log("Message:", message);
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "show me all services on Zero Gravity Compute Network",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "services were listed",
                    content: {
                        services: [],
                    },
                    action: "ZGC_LIST_SERVICES",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "show me all services on ZeroG",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "services were listed",
                    content: {
                        services: [],
                    },
                    action: "ZGC_LIST_SERVICES",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "show me all services on ZGC",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "services were listed",
                    content: {
                        services: [],
                    },
                    action: "ZGC_LIST_SERVICES",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "list all services on ZGC",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "services were listed",
                    content: {
                        services: [],
                    },
                    action: "ZGC_LIST_SERVICES",
                },
            },
        ],
    ] as ActionExample[][],
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        console.log("ZG_LIST_SERVICES action called");
        try {
            const zgConfig = await validateZeroGConfig(runtime);
            const provider = new ethers.JsonRpcProvider(zgConfig.ZEROG_RPC_URL);
            const signer = new ethers.Wallet(zgConfig.ZEROG_PRIVATE_KEY, provider);
            const broker = await createZGServingNetworkBroker(signer);
            const services = await broker.listService();
            const formattedServices = services.map(service => ({
                provider: service[0],
                name: service[1],
                serviceType: service[2],
                url: service[3],
                inputPrice: service[4].toString(),
                outputPrice: service[5].toString(),
                updatedAt: service[6].toString(),
                model: service[7],
            }));

            console.log("Available services:", formattedServices);
            const memory: Memory = {
                id: stringToUuid(Date.now().toString()),
                agentId: message.agentId,
                userId: message.userId,
                roomId: message.roomId,
                content: {
                    text: `Services on Zero Gravity Compute Network: ${JSON.stringify(formattedServices)}`,
                    action: "ZGC_LIST_SERVICES",
                },
                createdAt: Date.now(),
            };
            await runtime.messageManager.createMemory(memory);

            if (callback) {
                callback(
                    {
                    text: `Available services on ZGC: ${JSON.stringify(formattedServices)}`,
                    content: {
                        services: formattedServices,
                    },
                });
            }
        } catch (error) {
            console.error("Error listing services on ZGC:", error);
            if (callback) {
                callback({
                    text: `Error listing services on ZGC: ${error}`,
                });
            }
        }
    },
} as Action;
