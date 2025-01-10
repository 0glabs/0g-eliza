export interface ParsedArguments {
    character?: string;
    characters?: string;
    token?: string;
    validate?: boolean;
}

export interface TokenData {
    tokenId: string;
    owner: string;
    dataHashes: string[];
    dataDescriptions: string[];
    authorizedUsers: string[];
}

export interface AgentMetadata {
    character: string;
    memory: string;
}