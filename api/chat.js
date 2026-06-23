export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: body.system,
        messages: body.messages,
      }),
    });

    const rawText = await response.text();
    console.log("Anthropic raw:", rawText.substring(0, 500));
    const data = JSON.parse(rawText);
    res.status(200).json(data);
  } catch (err) {
    console.log("Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
