export const zgcExtractServicesTemplate = `
Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "provider": string | null;
    "name": string | null;
    "serviceType": string | null;
    "url": string | null;
    "inputPrice": bigint | null;
    "outputPrice": bigint | null;
    "updatedAt": bigint | null;
    "model": string | null;
    "deposit": bigint | null;
}
\`\`\`

Extract the services list from the following information. The information is not all related to services, so only extract the services related information. The information is sorted by time, and the latest information is used first.
 \`{{info}}\`

Further select one service from the services list and determine the deposit amount according to the user's intention. The deposit amount is in units of A0GI. Users might express this in various ways, such as:
- "create a new account on the first provider on Zero Gravity Compute Network, and I want to deposit 10 A0GI"
- "create a new account on the second provider on Zero Gravity Compute Network, and I want to deposit 10 A0GI"
- "create a new account on the first provider with the model 'gpt-4o' on Zero Gravity Compute Network, and I want to deposit 10 A0GI"
- "create a new account on the provider named 'chat-provider-1' on Zero Gravity Compute Network, and I want to deposit 10 A0GI"
- "create a new account on the provider with the type 'chatbot' on Zero Gravity Compute Network, and I want to deposit 10 A0GI"
- "create a new account on the provider with low input price on Zero Gravity Compute Network, and I want to deposit 10 A0GI"
- "create a new account on the provider with low output price on Zero Gravity Compute Network, and I want to deposit 10 A0GI"
- "create a new account on the provider with low input and output price on Zero Gravity Compute Network, and I want to deposit 10 A0GI"
- "deposit 10 A0GI to my account on the first provider on Zero Gravity Compute Network"
- "deposit 10 A0GI to my account on the provider with the model 'gpt-4o' on Zero Gravity Compute Network"
- "deposit 10 A0GI to my account on the provider named 'chat-provider-1' on Zero Gravity Compute Network"
- "deposit 10 A0GI to my account on the provider with the type 'chatbot' on Zero Gravity Compute Network"
- "deposit 10 A0GI to my account on the provider with low input price on Zero Gravity Compute Network"
- "deposit 10 A0GI to my account on the provider with low output price on Zero Gravity Compute Network"
- "deposit 10 A0GI to my account on the provider with low input and output price on Zero Gravity Compute Network"

{{recentMessages}}
`;