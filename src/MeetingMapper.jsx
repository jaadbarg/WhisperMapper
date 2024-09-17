// MeetingMapper.jsx
import React, { useState, useRef, useEffect } from "react";
import {
  Mic,
  StopCircle,
  RotateCcw,
  Download,
  FileText,
  GitBranch,
  AlertTriangle,
} from "lucide-react";

import Mermaid from "./Mermaid";
import mermaid from "mermaid";
import html2canvas from "html2canvas"; // Import html2canvas for screenshot functionality

const SAMPLE_RATE = 16000; // 16 kHz
const CHUNK_SIZE = SAMPLE_RATE * 10; // 10 seconds of audio
const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION = 3000; // 3 seconds
const FLOWCHART_UPDATE_DELAY = 2000; // 2 seconds

async function speechToText(audioBuffer) {
  try {
    const wavBlob = audioBufferToWav(audioBuffer);
    console.log("WAV blob size:", wavBlob.size, "bytes");

    const formData = new FormData();
    formData.append("file", wavBlob, "audio.wav");

    const response = await fetch(
      `${process.env.REACT_APP_BACKEND_URL}/api/speech-to-text`,
      {
        method: "POST",
        body: formData,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Error during transcription");
    }

    console.log("Transcription result:", data.text);
    return data.text;
  } catch (error) {
    console.error("Error in speech-to-text conversion:", error.message);
    throw error;
  }
}

function audioBufferToWav(audioBuffer) {
  const numOfChan = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  let sample;
  let pos = 0;

  // Write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // File length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // Length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(audioBuffer.sampleRate);
  setUint32(audioBuffer.sampleRate * 2 * numOfChan); // Avg. bytes/sec
  setUint16(numOfChan * 2); // Block-align
  setUint16(16); // 16-bit

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // Chunk length

  // Write interleaved data
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numOfChan; channel++) {
      sample = audioBuffer.getChannelData(channel)[i];
      sample = Math.max(-1, Math.min(1, sample));
      sample = (sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

async function generateFlowchart(conversation) {
  try {
    const response = await fetch(
      `${process.env.REACT_APP_BACKEND_URL}/api/generate-flowchart`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ conversation }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Error generating flowchart");
    }

    const mermaidSyntax = data.mermaidSyntax;

    console.log("Generated Mermaid syntax:", mermaidSyntax);

    // Validate Mermaid syntax
    try {
      await mermaid.parse(mermaidSyntax);
    } catch (error) {
      console.error("Invalid Mermaid syntax:", error);
      throw new Error("Generated flowchart is invalid. Please try again.");
    }

    return mermaidSyntax;
  } catch (error) {
    console.error("Error in flowchart generation:", error);
    throw error;
  }
}

export const MeetingMapper = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [flowchart, setFlowchart] = useState("");
  const [error, setError] = useState(null);
  const [isFlowchartLoading, setIsFlowchartLoading] = useState(false);
  const [flowchartError, setFlowchartError] = useState(null);
  const audioContext = useRef(null);
  const scriptProcessor = useRef(null);
  const audioBuffer = useRef(new Float32Array(CHUNK_SIZE));
  const bufferOffset = useRef(0);
  const silenceStart = useRef(null);
  const flowchartUpdateTimeout = useRef(null);
  const flowchartRef = useRef(null); // Ref to the flowchart element

  const processAudioChunk = async () => {
    const audioToProcess = audioBuffer.current.slice(0, bufferOffset.current);
    bufferOffset.current = 0;

    const audioBufferToSend = audioContext.current.createBuffer(
      1,
      audioToProcess.length,
      SAMPLE_RATE
    );
    audioBufferToSend.getChannelData(0).set(audioToProcess);

    try {
      const newText = await speechToText(audioBufferToSend);
      if (newText.trim()) {
        setTranscript((prevTranscript) => {
          const updatedTranscript = prevTranscript + " " + newText;

          // Clear any existing timeout
          if (flowchartUpdateTimeout.current) {
            clearTimeout(flowchartUpdateTimeout.current);
          }

          // Set a new timeout for flowchart update
          flowchartUpdateTimeout.current = setTimeout(async () => {
            setIsFlowchartLoading(true);
            setFlowchartError(null);
            try {
              const updatedFlowchart = await generateFlowchart(
                updatedTranscript
              );
              setFlowchart(updatedFlowchart);
            } catch (error) {
              console.error("Flowchart generation error:", error);
              setFlowchartError(
                "Failed to generate flowchart. Please try again."
              );
            } finally {
              setIsFlowchartLoading(false);
            }
          }, FLOWCHART_UPDATE_DELAY);

          return updatedTranscript;
        });

        setError(null);
      }
    } catch (error) {
      console.error("Failed to process audio:", error.message);
      setError("Failed to process audio: " + error.message);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext.current = new (window.AudioContext ||
        window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
      const source = audioContext.current.createMediaStreamSource(stream);

      scriptProcessor.current = audioContext.current.createScriptProcessor(
        4096,
        1,
        1
      );
      scriptProcessor.current.onaudioprocess = (audioProcessingEvent) => {
        const inputBuffer = audioProcessingEvent.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);

        // Check for silence
        const isCurrentlySilent = inputData.every(
          (sample) => Math.abs(sample) < SILENCE_THRESHOLD
        );

        if (isCurrentlySilent) {
          if (!silenceStart.current) {
            silenceStart.current = Date.now();
          } else if (Date.now() - silenceStart.current > SILENCE_DURATION) {
            stopRecording();
            return;
          }
        } else {
          silenceStart.current = null;
        }

        for (let i = 0; i < inputData.length; i++) {
          if (bufferOffset.current >= CHUNK_SIZE) {
            processAudioChunk();
          }
          audioBuffer.current[bufferOffset.current++] = inputData[i];
        }
      };

      source.connect(scriptProcessor.current);
      scriptProcessor.current.connect(audioContext.current.destination);

      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error.message);
      setError("Failed to start recording: " + error.message);
    }
  };

  const stopRecording = () => {
    if (audioContext.current && audioContext.current.state !== "closed") {
      scriptProcessor.current.disconnect();
      audioContext.current
        .close()
        .then(() => {
          console.log("AudioContext closed successfully");
        })
        .catch((error) => {
          console.error("Error closing AudioContext:", error);
        });
      setIsRecording(false);
      processAudioChunk(); // Process any remaining audio
    }
  };

  const resetMeetingMapper = () => {
    setIsRecording(false);
    setTranscript("");
    setFlowchart("");
    setError(null);
    setIsFlowchartLoading(false);
    setFlowchartError(null);
    if (audioContext.current && audioContext.current.state !== "closed") {
      scriptProcessor.current.disconnect();
      audioContext.current
        .close()
        .then(() => {
          console.log("AudioContext closed successfully during reset");
        })
        .catch((error) => {
          console.error("Error closing AudioContext during reset:", error);
        });
    }
    audioContext.current = null;
    scriptProcessor.current = null;
    audioBuffer.current = new Float32Array(CHUNK_SIZE);
    bufferOffset.current = 0;
    silenceStart.current = null;
    if (flowchartUpdateTimeout.current) {
      clearTimeout(flowchartUpdateTimeout.current);
    }
  };

  const downloadFlowchartAsPNG = async () => {
    if (!flowchart) {
      alert("No flowchart has been generated yet.");
      return;
    }

    try {
      const element = flowchartRef.current;
      const canvas = await html2canvas(element, {
        backgroundColor: null,
        useCORS: true,
        scale: 2,
      });
      const dataURL = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataURL;
      a.download = "flowchart.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading flowchart as PNG:", error);
      alert("Failed to download flowchart. Please try again.");
    }
  };

  useEffect(() => {
    return () => {
      if (audioContext.current && audioContext.current.state !== "closed") {
        scriptProcessor.current.disconnect();
        audioContext.current
          .close()
          .then(() => {
            console.log(
              "AudioContext closed successfully on component unmount"
            );
          })
          .catch((error) => {
            console.error(
              "Error closing AudioContext on component unmount:",
              error
            );
          });
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-indigo-100 flex flex-col">
      {/* Navbar */}
      <nav className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            {/* Logo */}
            <div className="text-indigo-600 text-2xl font-bold">
              <GitBranch className="inline-block h-8 w-8" />
            </div>
            <div className="text-indigo-800 text-2xl font-bold">
              WhisperMapper
            </div>
          </div>
          {/* Navigation Links (if any) */}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-extrabold text-indigo-800 mb-4">
              Real-Time Voice Mapper
            </h1>
            <p className="text-xl text-gray-700">
              Transform your thoughts into interactive flowcharts in real-time.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center space-x-4 mb-12">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`flex items-center justify-center px-8 py-4 rounded-full text-white font-semibold transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                isRecording
                  ? "bg-red-500 hover:bg-red-600 focus:ring-red-500"
                  : "bg-green-500 hover:bg-green-600 focus:ring-green-500"
              }`}
              disabled={isFlowchartLoading}
            >
              {isRecording ? (
                <>
                  <StopCircle className="inline mr-2" /> Stop Recording
                </>
              ) : (
                <>
                  <Mic className="inline mr-2" /> Start Recording
                </>
              )}
            </button>
            <button
              onClick={resetMeetingMapper}
              className="flex items-center justify-center px-8 py-4 rounded-full bg-blue-500 text-white font-semibold transition duration-300 ease-in-out transform hover:scale-105 hover:bg-blue-600 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-blue-500"
              disabled={isRecording}
            >
              <RotateCcw className="inline mr-2" /> Reset
            </button>
            <button
              onClick={downloadFlowchartAsPNG}
              className="flex items-center justify-center px-8 py-4 rounded-full bg-purple-500 text-white font-semibold transition duration-300 ease-in-out transform hover:scale-105 hover:bg-purple-600 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-purple-500"
              disabled={!flowchart}
            >
              <Download className="inline mr-2" /> Download Flowchart
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="max-w-3xl mx-auto mb-8">
              <div className="flex items-center bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md">
                <AlertTriangle className="mr-2" />
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Transcript Card */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="px-6 py-4 bg-indigo-600">
                <h2 className="text-2xl font-semibold text-white flex items-center">
                  <FileText className="mr-2" /> Transcript
                </h2>
              </div>
              <div className="p-6 h-96 overflow-y-auto">
                <p className="text-gray-800 whitespace-pre-wrap">
                  {transcript || "No transcript yet."}
                </p>
              </div>
            </div>

            {/* Flowchart Card */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="px-6 py-4 bg-indigo-600">
                <h2 className="text-2xl font-semibold text-white flex items-center">
                  <GitBranch className="mr-2" /> Conversation Flowchart
                </h2>
              </div>
              <div className="relative p-6 overflow-y-auto" ref={flowchartRef}>
                {isFlowchartLoading && (
                  <div className="absolute inset-0 bg-gray-100 bg-opacity-75 flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
                    <span className="mt-4 text-lg font-semibold text-indigo-700">
                      Updating flowchart...
                    </span>
                  </div>
                )}
                {flowchartError ? (
                  <div className="flex items-center text-yellow-600">
                    <AlertTriangle className="mr-2" />
                    <span>{flowchartError}</span>
                  </div>
                ) : flowchart ? (
                  <Mermaid
                    chart={flowchart}
                    onError={(error) => setFlowchartError(error)}
                  />
                ) : (
                  <p className="text-gray-600">No flowchart generated yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white shadow-inner py-4">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-600">
          &copy; {new Date().getFullYear()} WhisperMapper. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default MeetingMapper;
