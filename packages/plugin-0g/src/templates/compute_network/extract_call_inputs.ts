export const zgcExtractCallInputsTemplate = `
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
    "input": string | null;
}
\`\`\`

Extract the services list from the following information. The information is not all related to services, so only extract the services related information. The information is sorted by time, and the latest information is used first.
 \`{{info}}\`

Further select one service from the services list and determine the input according to the user's intention. The input is a string. Users might express this in various ways, such as:
- "call the first provider on Zero Gravity Compute Network, and the input is 'hello'"
- "call the second provider on Zero Gravity Compute Network, and the input is 'hello'"
- "call the provider with the model 'gpt-4o' on Zero Gravity Compute Network, and the input is 'hello'"
- "call the provider named 'chat-provider-1' on Zero Gravity Compute Network, and the input is 'hello'"
- "call the provider with the type 'chatbot' on Zero Gravity Compute Network, and the input is 'hello'"
- "call the provider with low input price on Zero Gravity Compute Network, and the input is 'hello'"
- "call the provider with low output price on Zero Gravity Compute Network, and the input is 'hello'"
- "call the provider with low input and output price on Zero Gravity Compute Network, and the input is 'hello'"

{{recentMessages}}
`;