const key = process.env.LLM_API_KEY, model = process.env.LLM_MODEL ?? "gemini-2.5-flash";
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: "POST",
  headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
  body: JSON.stringify({
    contents: [{ parts: [{ text: 'Buyer says: "My 45 EUR order is 6 days late, I am worried." Reply as JSON with action (notify|partial_refund|reship|full_refund) and reason.' }] }],
    generationConfig: { responseMimeType: "application/json" },
  }),
});
const j = await res.json();
console.log("http", res.status);
console.log(res.ok ? j.candidates?.[0]?.content?.parts?.[0]?.text : JSON.stringify(j.error ?? j).slice(0, 500));
