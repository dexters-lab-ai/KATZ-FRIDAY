import { ElevenLabsClient } from "elevenlabs";
import { SpeechClient } from "@google-cloud/speech";
import { config } from "../../core/config.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import os from "os";
import OpenAI from "openai";

const openai = new OpenAI();

class VoiceService {
  constructor() {
    this.elevenLabs = new ElevenLabsClient({
      apiKey: config.elevenLabsApiKey,
    });

    this.speechClient = new SpeechClient({
      keyFilename: config.googleApiKeyFile, // Path to Google Cloud API key file
    });

    this.defaultModel = "eleven_multilingual_v2"; // Default model for ElevenLabs multilingual support
    this.defaultVoice = "N2lVS1w4EtoT3dr4eOWO"; // Default ElevenLabs voice
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
      console.error("Error transcribing voice with Google STT:", error.message);
      throw new Error("Failed to transcribe voice message.");
    }
  }

  /**
   * Transcribe voice using OpenAI Whisper API
   * @param {string} fileUrl - Telegram voice message file URL
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribeVoiceWhisp(fileUrl) {
    try {
      // Fetch the audio file from Telegram
      const response = await axios.get(fileUrl, { responseType: "arraybuffer" });

      // Use OS-specific temporary directory
      const tempDir = os.tmpdir();
      const filePath = path.join(tempDir, "voice_message.ogg");

      // Save the file to the temporary directory
      fs.writeFileSync(filePath, response.data);

      // Transcribe using Whisper API
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-1",
      });

      // Clean up: Remove the temporary file
      fs.unlinkSync(filePath);

      return transcription.text.trim();
    } catch (error) {
      console.error("❌ Whisper transcription error:", error.message);
      throw new Error("Failed to transcribe the voice message.");
    }
  }

  /**
   * Generate speech from text using Google Text-to-Speech
   * @param {string} text - Text to convert to speech
   * @param {string} languageCode - Language code (e.g., "en-GB")
   * @param {string} voiceName - Voice name (e.g., "en-GB-News-H")
   * @returns {Promise<Buffer>} - Generated audio in LINEAR16 format
   */
  async synthesizeSpeechGoogle(text, languageCode = "en-GB", voiceName = "en-GB-News-H") {
    console.log("Google TTS input text:", text);
    try {
      const response = await axios.post(
        "https://texttospeech.googleapis.com/v1/text:synthesize",
        {
          input: { text },
          voice: { languageCode, name: voiceName },
          audioConfig: { audioEncoding: "LINEAR16" },
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await this.getGoogleAccessToken()}`,
          },
        }
      );

      if (response.data && response.data.audioContent) {
        console.log("✅ Google TTS succeeded");
        return Buffer.from(response.data.audioContent, "base64");
      } else {
        throw new Error("No audio content received from Google TTS.");
      }
    } catch (error) {
      console.error("Error generating speech with Google TTS:", error.message);
      throw new Error("Failed to synthesize speech with Google TTS.");
    }
  }

  /**
   * Generate speech from text using ElevenLabs
   * @param {string} text - Text to convert to speech
   * @param {string} voice_id - Voice ID (default set)
   * @param {string} model - ElevenLabs model (default: "eleven_multilingual_v2")
   * @returns {Promise<Buffer>} - Generated audio in MP3 format
   */
  async synthesizeSpeech(text, voice_id = this.defaultVoice, model = this.defaultModel) {
    console.log("ElevenLabs input text:", text);
    try {
      const audioBuffer = await this.elevenLabs.generate({
        text,
        voice_id,
        model_id: model,
      });

      return audioBuffer; // MP3 format ready for Telegram
    } catch (error) {
      console.error("Error generating speech with ElevenLabs:", error.message);
      throw new Error("Failed to synthesize speech.");
    }
  }

  /**
   * Helper function to get a Google Cloud access token
   * @returns {Promise<string>} - Access token
   */
  async getGoogleAccessToken() {
    try {
      const { execSync } = await import("child_process");
      const token = execSync("gcloud auth print-access-token").toString().trim();
      if (!token) throw new Error("Google access token retrieval failed.");
      return token;
    } catch (error) {
      console.error("Error fetching Google access token:", error.message);
      throw new Error("Failed to retrieve Google Cloud access token.");
    }
  }

  /**
   * Save audio to a file
   * @param {Buffer} audioBuffer - Audio buffer
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
