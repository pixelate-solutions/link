import { Message } from "@/app/types/message";

export const API_URL = process.env.NEXT_PUBLIC_API_URL;

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

export const chat = async (userId: string, query: string) => {
  const data = {
    user_id: userId,
    query: query,
  };
  const response = await fetch(`${API_URL}/chat/`, {
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

export const fetchData = async () => {
      try {
        const response = await fetch(`${API_URL}/newsletter/`, {
          method: 'GET',
        });
        const data = await response.json();
        return (data.message)
      } catch (error) {
        console.error('Fetch Error:', error);
      }
};

const timeframeMappings = {
  None: "none",
  Day: "d",
  Week: "w",
  Month: "m",
  Year: "y",
};

export const submitResearch = async (query: string, timeframe: string): Promise<string> => {
    const formData = new FormData();
    formData.append('query', query);
    const timeframeKey = timeframe as keyof typeof timeframeMappings;
    const mappedValue = timeframeMappings[timeframeKey];
    formData.append('timeframe', mappedValue || 'none');

    try {
        const response = await fetch(`${API_URL}/research`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            // Convert non-2xx HTTP responses into errors
            const errorText = await response.text();
            throw new Error(`Failed to submit research: ${errorText}`);
        }

        const data = await response.json();
        return data.message;
    } catch (error) {
        console.error('Submission Error:', error);
        throw error; // Rethrow the error for handling in the component
    }
};

export const uploadResource = async (formData: FormData): Promise<void> => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/resource/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error('Failed to upload resource');
  }
};

export const deleteResource = async (name: string): Promise<void> => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/resources/delete/${name}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete resource');
  }
};

export const updateResource = async (id: string, newName: string): Promise<void> => {
  const formData = new FormData();
  formData.append('name', newName);

  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/resources/${id}`, {
    method: 'PATCH',
    body: formData,
  });
  if (!response.ok) {
    throw new Error('Failed to update resource');
  }
};
