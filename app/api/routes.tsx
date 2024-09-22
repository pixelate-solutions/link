import { Message } from "@/app/types/message";

export const API_URL = process.env.NEXT_PUBLIC_AI_URL;

export async function clearChatHistory(userId:string) {
    const endpoint = `${API_URL}/chat/clear-history/${userId}`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                // Add any required headers here. For example, authorization headers if needed.
                'Content-Type': 'application/json',
            },
            // Include credentials if your API requires authentication and you're using cookies/session.
            credentials: 'include',
        });

        if (!response.ok) {
            // Handle non-200 responses.
            const errorText = await response.text();
            throw new Error(`Failed to clear chat history: ${errorText}`);
        }

        // Optionally, handle the response data if needed.
        const data = await response.json();
        console.log(data.message); // Log the success message.
    } catch (error) {
        console.error(error);
        // Handle errors, such as network issues or JSON parsing errors.
        throw error; // Rethrow or handle as needed.
    }
}

export const chat = async (userId: string, query: string, allow_access: boolean = false, using_user_id: boolean = true) => {
  const data = {
    user_id: userId,
    query: query,
    allow_access: allow_access,
    using_user_id: using_user_id,
  };
  const response = await fetch(`${API_URL}/finance/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  console.log(data)

  if (response.body) {
    const reader = response.body.getReader();
    return new ReadableStream({
      async start(controller) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
        reader.releaseLock();
      },
    });
  }
};


export const history = async (userId: string): Promise<Message[]> => {
  const response = await fetch(`${API_URL}/chat/history/${userId}`);
  return response.json();
};
