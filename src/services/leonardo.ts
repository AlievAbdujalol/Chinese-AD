
const API_URL = "/api/leonardo";

const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryOperation<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: any;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || '';
      
      if (msg.includes('Unauthorized') || msg.includes('401')) throw error;

      const isTransient = msg.includes('503') || msg.includes('429') || msg.includes('Failed to fetch') || msg.includes('NetworkError');
      if (isTransient) {
        const delay = INITIAL_DELAY * Math.pow(2, i);
        await wait(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const getApiKey = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('leonardo_api_key') || import.meta.env.VITE_LEONARDO_API_KEY;
  }
  return process.env.LEONARDO_API_KEY;
};

export async function generateImageLeonardo(prompt: string, width: number = 512, height: number = 512): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Leonardo API Key not found. Please set it in Settings.");

  return retryOperation(async () => {
    try {
      // 1. Initiate Generation
      const response = await fetch(`${API_URL}/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          prompt,
          width,
          height,
          modelId: "e316348f-7773-490e-adcd-46769c723d42", // Leonardo Diffusion XL
          num_images: 1,
          alchemy: true,
          presetStyle: "DYNAMIC"
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Leonardo API Error: ${response.status} - ${err}`);
      }

      const data = await response.json();
      const generationId = data.sdGenerationJob?.generationId;

      if (!generationId) {
        throw new Error("No generation ID returned from Leonardo.");
      }

      // 2. Poll for Result
      let attempts = 0;
      while (attempts < 30) { // Max 60 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusRes = await fetch(`${API_URL}/generations/${generationId}`, {
          headers: {
              'Authorization': `Bearer ${apiKey}`
          }
        });
        
        if (!statusRes.ok) continue;

        const statusData = await statusRes.json();
        const generation = statusData.generations_by_pk;

        if (generation && generation.status === 'COMPLETE') {
          return generation.generated_images?.[0]?.url || null;
        } else if (generation && generation.status === 'FAILED') {
          throw new Error("Leonardo Image Generation Failed.");
        }

        attempts++;
      }
      
      throw new Error("Leonardo Image Generation Timed Out.");

    } catch (error) {
      console.error("Leonardo Service Error:", error);
      throw error;
    }
  });
}
