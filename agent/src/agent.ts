import { PostgresDatabaseAdapter } from "@elizaos/adapter-postgres";
import { SqliteDatabaseAdapter } from "@elizaos/adapter-sqlite";
import { AutoClientInterface } from "@elizaos/client-auto";
import { DiscordClientInterface } from "@elizaos/client-discord";
import { FarcasterAgentClient } from "@elizaos/client-farcaster";
import { LensAgentClient } from "@elizaos/client-lens";
import { SlackClientInterface } from "@elizaos/client-slack";
import { TelegramClientInterface } from "@elizaos/client-telegram";
import { TwitterClientInterface } from "@elizaos/client-twitter";
import {
    AgentRuntime,
    CacheManager,
    Character,
    Clients,
    DbCacheAdapter,
    defaultCharacter,
    elizaLogger,
    FsCacheAdapter,
    IAgentRuntime,
    IDatabaseAdapter,
    IDatabaseCacheAdapter,
    ModelProviderName,
    settings,
    stringToUuid,
    validateCharacterConfig,
    CacheStore,
    Client,
    ICacheManager
} from "@elizaos/core";
import { RedisClient } from "@elizaos/adapter-redis";
import { zgPlugin } from "@elizaos/plugin-0g";
import { bootstrapPlugin } from "@elizaos/plugin-bootstrap";
import createGoatPlugin from "@elizaos/plugin-goat";
import { DirectClient } from "@elizaos/client-direct";
import { aptosPlugin } from "@elizaos/plugin-aptos";
import {
    advancedTradePlugin,
    coinbaseCommercePlugin,
    coinbaseMassPaymentsPlugin,
    tokenContractPlugin,
    tradePlugin,
    webhookPlugin,
} from "@elizaos/plugin-coinbase";
import { confluxPlugin } from "@elizaos/plugin-conflux";
import { evmPlugin } from "@elizaos/plugin-evm";
import { storyPlugin } from "@elizaos/plugin-story";
import { flowPlugin } from "@elizaos/plugin-flow";
import { fuelPlugin } from "@elizaos/plugin-fuel";
import { imageGenerationPlugin } from "@elizaos/plugin-image-generation";
import { ThreeDGenerationPlugin } from "@elizaos/plugin-3d-generation";
import { multiversxPlugin } from "@elizaos/plugin-multiversx";
import { nearPlugin } from "@elizaos/plugin-near";
import { nftGenerationPlugin } from "@elizaos/plugin-nft-generation";
import { createNodePlugin } from "@elizaos/plugin-node";
import { solanaPlugin } from "@elizaos/plugin-solana";
import { suiPlugin } from "@elizaos/plugin-sui";
import { TEEMode, teePlugin } from "@elizaos/plugin-tee";
import { tonPlugin } from "@elizaos/plugin-ton";
import { zksyncEraPlugin } from "@elizaos/plugin-zksync-era";
import { cronosZkEVMPlugin } from "@elizaos/plugin-cronoszkevm";
import { abstractPlugin } from "@elizaos/plugin-abstract";
import { avalanchePlugin } from "@elizaos/plugin-avalanche";
import { webSearchPlugin } from "@elizaos/plugin-web-search";
import { echoChamberPlugin } from "@elizaos/plugin-echochambers";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yargs from "yargs";
import net from "net";
import { ParsedArguments } from "./types";
import { AgentNFTClient } from "./agentNFTClient";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
    const waitTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
    return new Promise((resolve) => setTimeout(resolve, waitTime));
};

const logFetch = async (url: string, options: any) => {
    elizaLogger.debug(`Fetching ${url}`);
    return fetch(url, options);
};

export function parseArguments(): ParsedArguments {
    try {
        return yargs(process.argv.slice(3))
            .option("character", {
                type: "string",
                description: "Path to the character JSON file",
            })
            .option("characters", {
                type: "string",
                description: "Comma separated list of paths to character JSON files",
            })
            .option("token", {
                type: "string",
                description: "Comma separated list of NFT token IDs to load configuration from",
            })
            .option("dir", {
                type: "string",
                description: "Base directory storing the agent data",
                default: ""
            })
            .parseSync();
    } catch (error) {
        elizaLogger.error("Error parsing arguments:", error);
        throw error;
    }
}

function tryLoadFile(filePath: string): string | null {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch (e) {
        return null;
    }
}

function isAllStrings(arr: unknown[]): boolean {
    return Array.isArray(arr) && arr.every((item) => typeof item === "string");
}

export async function loadCharacters(charactersArg: string): Promise<Character[]> {
    let characterPaths = charactersArg?.split(",").map((filePath) => filePath.trim());
    const loadedCharacters = [];

    if (characterPaths?.length > 0) {
        for (const characterPath of characterPaths) {
            let content = null;
            let resolvedPath = "";

            const pathsToTry = [
                characterPath,
                path.resolve(process.cwd(), characterPath),
                path.resolve(process.cwd(), "agent", characterPath),
                path.resolve(__dirname, characterPath),
                path.resolve(__dirname, "characters", path.basename(characterPath)),
                path.resolve(__dirname, "../characters", path.basename(characterPath)),
                path.resolve(__dirname, "../../characters", path.basename(characterPath)),
            ];

            elizaLogger.info(
                "Trying paths:",
                pathsToTry.map((p) => ({
                    path: p,
                    exists: fs.existsSync(p),
                }))
            );

            for (const tryPath of pathsToTry) {
                content = tryLoadFile(tryPath);
                if (content !== null) {
                    resolvedPath = tryPath;
                    break;
                }
            }

            if (content === null) {
                elizaLogger.error(
                    `Error loading character from ${characterPath}: File not found in any of the expected locations`
                );
                elizaLogger.error("Tried the following paths:");
                pathsToTry.forEach((p) => elizaLogger.error(` - ${p}`));
                process.exit(1);
            }

            try {
                const character = JSON.parse(content);
                validateCharacterConfig(character);

                const characterId = character.id || character.name;
                const characterPrefix = `CHARACTER.${characterId.toUpperCase().replace(/ /g, "_")}.`;

                const characterSettings = Object.entries(process.env)
                    .filter(([key]) => key.startsWith(characterPrefix))
                    .reduce((settings, [key, value]) => {
                        const settingKey = key.slice(characterPrefix.length);
                        return { ...settings, [settingKey]: value };
                    }, {});

                if (Object.keys(characterSettings).length > 0) {
                    character.settings = character.settings || {};
                    character.settings.secrets = {
                        ...characterSettings,
                        ...character.settings.secrets,
                    };
                }

                if (isAllStrings(character.plugins)) {
                    elizaLogger.info("Plugins are: ", character.plugins);
                    const importedPlugins = await Promise.all(
                        character.plugins.map(async (plugin) => {
                            const importedPlugin = await import(plugin);
                            return importedPlugin.default;
                        })
                    );
                    character.plugins = importedPlugins;
                }

                loadedCharacters.push(character);
                elizaLogger.info(`Successfully loaded character from: ${resolvedPath}`);
            } catch (e) {
                elizaLogger.error(`Error parsing character from ${resolvedPath}: ${e}`);
                process.exit(1);
            }
        }
    }

    if (loadedCharacters.length === 0) {
        elizaLogger.info("No characters found, using default character");
        loadedCharacters.push(defaultCharacter);
    }

    return loadedCharacters;
}

export function getTokenForProvider(provider: ModelProviderName, character: Character): string {
    switch (provider) {
        case ModelProviderName.LLAMALOCAL:
        case ModelProviderName.OLLAMA:
        case ModelProviderName.GAIANET:
            return "";
        case ModelProviderName.OPENAI:
            return character.settings?.secrets?.OPENAI_API_KEY || settings.OPENAI_API_KEY;
        case ModelProviderName.ETERNALAI:
            return character.settings?.secrets?.ETERNALAI_API_KEY || settings.ETERNALAI_API_KEY;
        case ModelProviderName.LLAMACLOUD:
        case ModelProviderName.TOGETHER:
            return (
                character.settings?.secrets?.LLAMACLOUD_API_KEY ||
                settings.LLAMACLOUD_API_KEY ||
                character.settings?.secrets?.TOGETHER_API_KEY ||
                settings.TOGETHER_API_KEY ||
                character.settings?.secrets?.XAI_API_KEY ||
                settings.XAI_API_KEY ||
                character.settings?.secrets?.OPENAI_API_KEY ||
                settings.OPENAI_API_KEY
            );
        case ModelProviderName.CLAUDE_VERTEX:
        case ModelProviderName.ANTHROPIC:
            return (
                character.settings?.secrets?.ANTHROPIC_API_KEY ||
                character.settings?.secrets?.CLAUDE_API_KEY ||
                settings.ANTHROPIC_API_KEY ||
                settings.CLAUDE_API_KEY
            );
        case ModelProviderName.REDPILL:
            return character.settings?.secrets?.REDPILL_API_KEY || settings.REDPILL_API_KEY;
        case ModelProviderName.OPENROUTER:
            return character.settings?.secrets?.OPENROUTER || settings.OPENROUTER_API_KEY;
        case ModelProviderName.GROK:
            return character.settings?.secrets?.GROK_API_KEY || settings.GROK_API_KEY;
        case ModelProviderName.HEURIST:
            return character.settings?.secrets?.HEURIST_API_KEY || settings.HEURIST_API_KEY;
        case ModelProviderName.GROQ:
            return character.settings?.secrets?.GROQ_API_KEY || settings.GROQ_API_KEY;
        case ModelProviderName.GALADRIEL:
            return character.settings?.secrets?.GALADRIEL_API_KEY || settings.GALADRIEL_API_KEY;
        case ModelProviderName.FAL:
            return character.settings?.secrets?.FAL_API_KEY || settings.FAL_API_KEY;
        case ModelProviderName.ALI_BAILIAN:
            return character.settings?.secrets?.ALI_BAILIAN_API_KEY || settings.ALI_BAILIAN_API_KEY;
        case ModelProviderName.VOLENGINE:
            return character.settings?.secrets?.VOLENGINE_API_KEY || settings.VOLENGINE_API_KEY;
        case ModelProviderName.NANOGPT:
            return character.settings?.secrets?.NANOGPT_API_KEY || settings.NANOGPT_API_KEY;
        case ModelProviderName.HYPERBOLIC:
            return character.settings?.secrets?.HYPERBOLIC_API_KEY || settings.HYPERBOLIC_API_KEY;
        case ModelProviderName.VENICE:
            return character.settings?.secrets?.VENICE_API_KEY || settings.VENICE_API_KEY;
        case ModelProviderName.AKASH_CHAT_API:
            return character.settings?.secrets?.AKASH_CHAT_API_KEY || settings.AKASH_CHAT_API_KEY;
        case ModelProviderName.GOOGLE:
            return (
                character.settings?.secrets?.GOOGLE_GENERATIVE_AI_API_KEY ||
                settings.GOOGLE_GENERATIVE_AI_API_KEY
            );
        default:
            const errorMessage = `Failed to get token - unsupported model provider: ${provider}`;
            elizaLogger.error(errorMessage);
            throw new Error(errorMessage);
    }
}

export function initializeDatabase(dataDir: string) {
    if (process.env.POSTGRES_URL) {
        elizaLogger.info("Initializing PostgreSQL connection...");
        const db = new PostgresDatabaseAdapter({
            connectionString: process.env.POSTGRES_URL,
            parseInputs: true,
        });

        db.init()
            .then(() => {
                elizaLogger.success("Successfully connected to PostgreSQL database");
            })
            .catch((error) => {
                elizaLogger.error("Failed to connect to PostgreSQL:", error);
            });

        return db;
    } else {
        const filePath = process.env.SQLITE_FILE ?? path.resolve(dataDir, "db.sqlite");
        const db = new SqliteDatabaseAdapter(new Database(filePath));
        return db;
    }
}

export async function initializeClients(character: Character, runtime: IAgentRuntime) {
    const clients: Record<string, any> = {};
    const clientTypes: string[] = character.clients?.map((str) => str.toLowerCase()) || [];
    elizaLogger.log("initializeClients", clientTypes, "for", character.name);

    if (clientTypes.includes(Clients.DIRECT)) {
        const autoClient = await AutoClientInterface.start(runtime);
        if (autoClient) clients.auto = autoClient;
    }

    if (clientTypes.includes(Clients.DISCORD)) {
        const discordClient = await DiscordClientInterface.start(runtime);
        if (discordClient) clients.discord = discordClient;
    }

    if (clientTypes.includes(Clients.TELEGRAM)) {
        const telegramClient = await TelegramClientInterface.start(runtime);
        if (telegramClient) clients.telegram = telegramClient;
    }

    if (clientTypes.includes(Clients.TWITTER)) {
        const twitterClient = await TwitterClientInterface.start(runtime);
        if (twitterClient) {
            clients.twitter = twitterClient;
        }
    }

    if (clientTypes.includes(Clients.FARCASTER)) {
        const farcasterClient = new FarcasterAgentClient(runtime);
        if (farcasterClient) {
            farcasterClient.start();
            clients.farcaster = farcasterClient;
        }
    }

    if (clientTypes.includes("lens")) {
        const lensClient = new LensAgentClient(runtime);
        lensClient.start();
        clients.lens = lensClient;
    }

    if (clientTypes.includes("slack")) {
        const slackClient = await SlackClientInterface.start(runtime);
        if (slackClient) clients.slack = slackClient;
    }

    function determineClientType(client: Client): string {
        if ("type" in client) {
            return (client as any).type
        }

        const constructorName = client.constructor?.name;
        if (constructorName && !constructorName.includes("Object")) {
            return constructorName.toLowerCase().replace("client", "");
        }

        return `client_${Date.now()}`;
    }

    if (character.plugins?.length > 0) {
        for (const plugin of character.plugins) {
            if (plugin.clients) {
                for (const client of plugin.clients) {
                    const startedClient = await client.start(runtime);
                    const clientType = determineClientType(client);
                    elizaLogger.debug(`Initializing client of type: ${clientType}`);
                    clients[clientType] = startedClient;
                }
            }
        }
    }

    return clients;
}

let nodePlugin: any | undefined;

export function getSecret(character: Character, secret: string) {
    return character.settings?.secrets?.[secret] || process.env[secret];
}

export async function createAgent(
    character: Character,
    db: IDatabaseAdapter,
    cache: ICacheManager,
    token: string
): Promise<AgentRuntime> {
    elizaLogger.success(
        elizaLogger.successesTitle,
        "Creating runtime for character",
        character.name
    );

    nodePlugin ??= createNodePlugin();

    const teeMode = getSecret(character, "TEE_MODE") || "OFF";
    const walletSecretSalt = getSecret(character, "WALLET_SECRET_SALT");

    if (teeMode !== TEEMode.OFF && !walletSecretSalt) {
        elizaLogger.error("WALLET_SECRET_SALT required when TEE_MODE is enabled");
        throw new Error("Invalid TEE configuration");
    }

    let goatPlugin: any | undefined;

    if (getSecret(character, "EVM_PRIVATE_KEY")) {
        goatPlugin = await createGoatPlugin((secret) => getSecret(character, secret));
    }

    return new AgentRuntime({
        databaseAdapter: db,
        token,
        modelProvider: character.modelProvider,
        evaluators: [],
        character,
        plugins: [
            bootstrapPlugin,
            getSecret(character, "CONFLUX_CORE_PRIVATE_KEY") ? confluxPlugin : null,
            nodePlugin,
            getSecret(character, "TAVILY_API_KEY") ? webSearchPlugin : null,
            getSecret(character, "SOLANA_PUBLIC_KEY") ||
            (getSecret(character, "WALLET_PUBLIC_KEY") &&
                !getSecret(character, "WALLET_PUBLIC_KEY")?.startsWith("0x"))
                ? solanaPlugin
                : null,
            (getSecret(character, "NEAR_ADDRESS") ||
                getSecret(character, "NEAR_WALLET_PUBLIC_KEY")) &&
            getSecret(character, "NEAR_WALLET_SECRET_KEY")
                ? nearPlugin
                : null,
            getSecret(character, "EVM_PUBLIC_KEY") ||
            (getSecret(character, "WALLET_PUBLIC_KEY") &&
                getSecret(character, "WALLET_PUBLIC_KEY")?.startsWith("0x"))
                ? evmPlugin
                : null,
            (getSecret(character, "SOLANA_PUBLIC_KEY") ||
                (getSecret(character, "WALLET_PUBLIC_KEY") &&
                    !getSecret(character, "WALLET_PUBLIC_KEY")?.startsWith("0x"))) &&
            getSecret(character, "SOLANA_ADMIN_PUBLIC_KEY") &&
            getSecret(character, "SOLANA_PRIVATE_KEY") &&
            getSecret(character, "SOLANA_ADMIN_PRIVATE_KEY")
                ? nftGenerationPlugin
                : null,
            getSecret(character, "ZEROG_PRIVATE_KEY") ? zgPlugin : null,
            getSecret(character, "COINBASE_COMMERCE_KEY") ? coinbaseCommercePlugin : null,
            getSecret(character, "FAL_API_KEY") ||
            getSecret(character, "OPENAI_API_KEY") ||
            getSecret(character, "VENICE_API_KEY") ||
            getSecret(character, "HEURIST_API_KEY") ||
            getSecret(character, "LIVEPEER_GATEWAY_URL")
                ? imageGenerationPlugin
                : null,
            getSecret(character, "FAL_API_KEY") ? ThreeDGenerationPlugin : null,
            ...(getSecret(character, "COINBASE_API_KEY") &&
            getSecret(character, "COINBASE_PRIVATE_KEY")
                ? [
                      coinbaseMassPaymentsPlugin,
                      tradePlugin,
                      tokenContractPlugin,
                      advancedTradePlugin,
                  ]
                : []),
            ...(teeMode !== TEEMode.OFF && walletSecretSalt ? [teePlugin, solanaPlugin] : []),
            getSecret(character, "COINBASE_API_KEY") &&
            getSecret(character, "COINBASE_PRIVATE_KEY") &&
            getSecret(character, "COINBASE_NOTIFICATION_URI")
                ? webhookPlugin
                : null,
            goatPlugin,
            getSecret(character, "ABSTRACT_PRIVATE_KEY") ? abstractPlugin : null,
            getSecret(character, "FLOW_ADDRESS") && getSecret(character, "FLOW_PRIVATE_KEY")
                ? flowPlugin
                : null,
            getSecret(character, "APTOS_PRIVATE_KEY") ? aptosPlugin : null,
            getSecret(character, "MVX_PRIVATE_KEY") ? multiversxPlugin : null,
            getSecret(character, "ZKSYNC_PRIVATE_KEY") ? zksyncEraPlugin : null,
            getSecret(character, "CRONOSZKEVM_PRIVATE_KEY") ? cronosZkEVMPlugin : null,
            getSecret(character, "TON_PRIVATE_KEY") ? tonPlugin : null,
            getSecret(character, "SUI_PRIVATE_KEY") ? suiPlugin : null,
            getSecret(character, "STORY_PRIVATE_KEY") ? storyPlugin : null,
            getSecret(character, "FUEL_PRIVATE_KEY") ? fuelPlugin : null,
            getSecret(character, "AVALANCHE_PRIVATE_KEY") ? avalanchePlugin : null,
            getSecret(character, "ECHOCHAMBERS_API_URL") &&
            getSecret(character, "ECHOCHAMBERS_API_KEY")
                ? echoChamberPlugin
                : null,
        ].filter(Boolean),
        providers: [],
        actions: [],
        services: [],
        managers: [],
        cacheManager: cache,
        fetch: logFetch,
    });
}

function initializeFsCache(baseDir: string, character: Character) {
    const cacheDir = path.resolve(baseDir, character.id, "cache");
    const cache = new CacheManager(new FsCacheAdapter(cacheDir));
    return cache;
}

function initializeDbCache(character: Character, db: IDatabaseCacheAdapter) {
    const cache = new CacheManager(new DbCacheAdapter(db, character.id));
    return cache;
}

export function initializeCache(
    cacheStore: string,
    character: Character,
    baseDir?: string,
    db?: IDatabaseCacheAdapter
) {
    switch (cacheStore) {
        case CacheStore.REDIS:
            if (process.env.REDIS_URL) {
                elizaLogger.info("Connecting to Redis...");
                const redisClient = new RedisClient(process.env.REDIS_URL);
                return new CacheManager(
                    new DbCacheAdapter(redisClient, character.id)
                );
            } else {
                throw new Error("REDIS_URL environment variable is not set.");
            }

        case CacheStore.DATABASE:
            if (db) {
                elizaLogger.info("Using Database Cache...");
                return initializeDbCache(character, db);
            } else {
                throw new Error("Database adapter is not provided for CacheStore.Database.");
            }

        case CacheStore.FILESYSTEM:
            elizaLogger.info("Using File System Cache...");
            return initializeFsCache(baseDir, character);

        default:
            throw new Error(`Invalid cache store: ${cacheStore} or required configuration missing.`);
    }
}

export async function startAgent(
    character: Character,
    directClient: DirectClient
): Promise<AgentRuntime> {
    let db: IDatabaseAdapter & IDatabaseCacheAdapter;
    try {
        character.id ??= stringToUuid(character.name);
        character.username ??= character.name;

        const token = getTokenForProvider(character.modelProvider, character);
        const dataDir = path.join(__dirname, "../data");

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        db = initializeDatabase(dataDir) as IDatabaseAdapter & IDatabaseCacheAdapter;
        await db.init();

        const cache = initializeCache(
            process.env.CACHE_STORE ?? CacheStore.DATABASE,
            character,
            "",
            db
        );

        const runtime: AgentRuntime = await createAgent(character, db, cache, token);
        await runtime.initialize();
        runtime.clients = await initializeClients(character, runtime);
        directClient.registerAgent(runtime);

        elizaLogger.debug(`Started ${character.name} as ${runtime.agentId}`);

        return runtime;
    } catch (error) {
        elizaLogger.error(`Error starting agent for character ${character.name}:`, error);
        elizaLogger.error(error);
        if (db) {
            await db.close();
        }
        throw error;
    }
}

export function checkPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
                resolve(false);
            }
        });

        server.once("listening", () => {
            server.close();
            resolve(true);
        });

        server.listen(port);
    });
}

export async function loadFromNFT(tokenId: string, baseDir: string = ""): Promise<Character[]> {
    const agentNFTClient = new AgentNFTClient(baseDir);

    const name = await agentNFTClient.getNFTName();
    elizaLogger.info(`NFT name: ${name}`);
    const symbol = await agentNFTClient.getNFTSymbol();
    elizaLogger.info(`NFT symbol: ${symbol}`);
    const { rpcURL, indexerURL } = await agentNFTClient.getTokenURI(tokenId);
    elizaLogger.info(`Rpc URL: ${rpcURL}`);
    elizaLogger.info(`Indexer URL: ${indexerURL}`);


    elizaLogger.info(`Fetching data for token[${tokenId}] from ${indexerURL}...`);
    const tokenData = await agentNFTClient.getTokenData(tokenId);
    elizaLogger.info("tokenData", tokenData);

    elizaLogger.info("Validating token ownership and permissions...");
    const isValid = await agentNFTClient.validateToken(tokenData);
    if (!isValid) {
        elizaLogger.error("Token validation failed");
        throw new Error(`Token validation failed`);
    }
    elizaLogger.success("Token validation successful");

    elizaLogger.info("Downloading and saving token data...");
    const agentMetadata = await agentNFTClient.downloadAndSaveData(tokenId, tokenData.dataHashes, tokenData.dataDescriptions);
    elizaLogger.info("agentMetadata", agentMetadata);
    process.env.SQLITE_FILE = agentMetadata.memory;

    return loadCharacters(agentMetadata.character);
}