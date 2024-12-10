export const zgcExtractUnpaiedTemplate = `
Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "service": {
        "provider": string | null;
        "name": string | null;
        "serviceType": string | null;
        "url": string | null;
        "inputPrice": string | null;
        "outputPrice": string | null;
        "updatedAt": string | null;
        "model": string | null;
    },
    "fee": string | null;
}
\`\`\`

Extract the services and fee from the following information. The information is not all related to services, so only extract the services related information. The information is sorted by time, and the latest information is used first. The fee is in unit of A0GI, and extract the fee without unit.
 \`{{info}}\`

{{recentMessages}}
`;