import { IAgentRuntime } from "@ai16z/eliza";
import { z } from "zod";

export const zeroGEnvSchema = z.object({
    // ZeroG chain
    ZEROG_PRIVATE_KEY: z.string().min(1, "ZeroG private key is required"),
    ZEROG_RPC_URL: z.string().min(1, "ZeroG chain RPC URL is required"),

    // ZeroG storage network
    ZEROG_INDEXER_RPC_URL: z.string().min(1, "ZeroG indexer RPC URL is required"),

    // ZeroG compute network
    ZEROG_COMPUTE_PROVIDER_ADDRESS: z.string().min(1, "ZeroG compute provider address is required"),
});


export type ZeroGConfig = z.infer<typeof zeroGEnvSchema>;

export async function validateZeroGConfig(
    runtime: IAgentRuntime
): Promise<ZeroGConfig> {
    try {
        const config = {
            ZEROG_PRIVATE_KEY:
                runtime.getSetting("ZEROG_PRIVATE_KEY") ||
                process.env.ZEROG_PRIVATE_KEY,
            ZEROG_RPC_URL:
                runtime.getSetting("ZEROG_RPC_URL") ||
                process.env.ZEROG_RPC_URL,
            ZEROG_INDEXER_RPC_URL:
                runtime.getSetting("ZEROG_INDEXER_RPC_URL") ||
                process.env.ZEROG_INDEXER_RPC_URL,
            ZEROG_COMPUTE_PROVIDER_ADDRESS:
                runtime.getSetting("ZEROG_COMPUTE_PROVIDER_ADDRESS") ||
                process.env.ZEROG_COMPUTE_PROVIDER_ADDRESS,
        };

        return zeroGEnvSchema.parse(config);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessages = error.errors
                .map((err) => `${err.path.join(".")}: ${err.message}`)
                .join("\n");
            throw new Error(
                `ZeroG configuration validation failed:\n${errorMessages}`
            );
        }
        throw error;
    }
}
