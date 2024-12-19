export const zgsExtractFilePathTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "filePath": string,
    "rootHash": string | null,
    "isUrl": boolean
}
\`\`\`

{{recentMessages}}

Current directory info:
- Current working directory: cur_dir=\`\${process.cwd()}\`
- Files in current directory: files=\`{{listFilesInCurrentDir}}\`

Extract the user's intention to upload/download a file from the conversation. Users might express this in various ways, such as:
- "I want to upload cv.pdf from zero gravity storage"
- "upload /root/cv.pdf to zero gravity storage"
- "upload /root/cv.pdf to zgs"
- "upload this file to zero gravity storage [Document: The file description.] [Url: https://www.google.com]"
- "upload this image to zero gravity storage [Image: **Title: SNARK Protocol Diagram**\n' +
      '\n' +
      'This image illustrates the architecture of a SNARK (Succinct Non-interactive Argument of Knowledge) protocol. The diagram features a central rectangular block labeled "SNARK.P," which signifies the proving component of the SNARK system. Inside this block, there is a labeled section titled "CIRCUIT," which contains a function denoted as "F." Arrows indicate the flow of information between various components: inputs \\( z_{i-1} \\) and \\( \\pi_{i-1} \\) lead into the circuit, producing outputs \\( z_i \\) and \\( \\pi_i \\). These outputs then proceed to a block marked "SNARK.V," representing the verification stage, which ultimately produces a binary output (0 or 1) indicating validity. The overall layout presents a clear pathway of data from inputs through processing to verification.] [Url: https://www.google.com]"
- "I want to download a file with a root hash of 0x1234567890 as cv.pdf"
- "download /root/cv.pdf with root hash 0x1234567890 from zero gravity storage"

Here are some key rules you should follow:
1. You should prioritize extracting information from the last message from the user.
2. If the user provides a absolute file path, use that as the file path.
3. If the user provides a just file name, you should add the current directory to the file name, like cur_dir/file_name.
4. If the user does not provide a file path, consider is a remote file, and set the isUrl to true.
5. The file path maybe provided as an url, like [Url: https://www.google.com]. If the user provides an url, set the isUrl to true, and the filePath should be the url.
6. In the case of downloading a file, the user will provide the root hash of the file. And the file path should be extracted strictly from the user's message. If the user just provides a file name, you should add the current directory to the file name, like cur_dir/file_name.
7. You should correct the file name according to files in current directory.`;