import { ElevenLabsClient } from "elevenlabs";
import { SpeechClient } from "@google-cloud/speech";
import { config } from "../../core/config.js";
import fs from "fs";
import axios from "axios";

class VoiceService {
  constructor() {
    this.elevenLabs = new ElevenLabsClient({
      apiKey: config.elevenLabsApiKey,
    });

    this.speechClient = new SpeechClient({
      keyFilename: config.googleApiKeyFile, // Path to Google Cloud API key file
    });
    
    this.defaultModel = "eleven_multilingual_v2"; // Default model for multilingual support
    this.defaultVoice = "N2lVS1w4EtoT3dr4eOWO"; // Name or ID: Will give users power over preferred voice soon...
  }

  /**
   * Transcribe voice message to text using Google Speech-to-Text
   * @param {string} voiceUrl - Telegram file URL for the voice message
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribeVoice(voiceUrl) {
    try {
      // Download the voice file from Telegram
      const response = await axios.get(voiceUrl, { responseType: "arraybuffer" });
      const audioBuffer = Buffer.from(response.data);

      // Configure Google Speech-to-Text request
      const request = {
        audio: { content: audioBuffer.toString("base64") },
        config: {
          encoding: "OGG_OPUS", // Telegram sends voice messages in OGG Opus format
          sampleRateHertz: 16000,
          languageCode: "en-US", // Set desired language
        },
      };

      // Perform transcription
      const [operation] = await this.speechClient.recognize(request);
      const transcription = operation.results
        .map((result) => result.alternatives[0].transcript)
        .join(" ");
      return transcription;
    } catch (error) {
      console.error("Error transcribing voice:", error.message);
      throw new Error("Failed to transcribe voice message.");
    }
  }

  /**
   * Generate speech from text using ElevenLabs
   * @param {string} text - Text to convert to speech
   * @param {string} voice - Voice name (e.g., "Rachel", "Domi")
   * @param {string} model - ElevenLabs model (default: "eleven_multilingual_v2")
   * @returns {Promise<Buffer>} - Generated audio in MP3 format
   */
  async synthesizeSpeech(text, voice_id = this.defaultVoice, model = this.defaultModel) {
    console.log('voice to speech text input: ', text)
    try {
      const audioBuffer = await this.elevenLabs.generate({
        text,
        voice_id,
        model_id: model,
      });

      return audioBuffer; // MP3 format ready for Telegram
    } catch (error) {
      console.error("Error generating speech:", error.message);
      throw new Error("Failed to synthesize speech.");
    }
  }

  /**
   * Save MP3 audio to a file
   * @param {Buffer} audioBuffer - MP3 audio buffer
   * @param {string} filePath - Path to save the file
   */
  saveAudioToFile(audioBuffer, filePath) {
    try {
      fs.writeFileSync(filePath, audioBuffer);
      console.log(`Audio saved to ${filePath}`);
    } catch (error) {
      console.error("Error saving audio file:", error.message);
      throw new Error("Failed to save audio file.");
    }
  }
}

export const voiceService = new VoiceService();
