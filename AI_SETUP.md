# CEC Portal — Real AI Assistant (Phase 3.1)

The CEC AI Assistant uses WebLLM to run an open-source language model directly in the user's browser. It does not require an OpenAI, Gemini, or other paid AI API key.

## Requirements

- A modern browser with WebGPU (Chrome/Edge recommended).
- Internet access for the first model download.
- Enough disk/GPU memory for the selected model.
- A logged-in CEC student, faculty, or admin account.

## Models

- Standard: `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` — better answers, larger download.
- Light: `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` — smaller and easier to run on lower-end hardware.

The model is cached by WebLLM after it is downloaded. The first start can take several minutes depending on the device and connection.

## Privacy architecture

1. Firebase Authentication identifies the logged-in role.
2. The existing portal data layer provides only the data already available to that role.
3. The browser creates a restricted AI context from that data.
4. WebLLM performs inference locally in the same browser.
5. No AI API key is embedded in the project.
6. No separate AI server is required.

## Important limitation

This is true generative AI, but the model is intentionally small enough to run without paid infrastructure. It will not be as capable as a hosted large model such as ChatGPT. The system prompt also instructs the model to avoid inventing portal-specific facts.

If WebGPU is unavailable, the AI cannot run on that device. Use the Light model or a newer/compatible device.
