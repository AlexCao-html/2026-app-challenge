// Speech-to-text for answering the interviewer out loud, using the browser's
// Web Speech API (Chrome, Edge, Safari -- not Firefox). Ported from ReelLife's
// src/js/interview.js.
//
// It dictates into the answer box rather than sending each phrase on its own:
// the recognizer finalizes a phrase at every pause, and sending those as
// separate answers had the interviewer asking a new question mid-sentence.
// The words still being recognized show as a live caption under the box.

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

// null when the browser can't do it; testChat.js hides the mic button then.
function createDictation({ onFinalText, onInterimText, onListeningChange, onError }) {
    if (!SpeechRecognitionImpl) return null;

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    let listening = false;

    function setListening(value) {
        listening = value;
        onListeningChange(value);
    }

    recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) onFinalText(transcript.trim());
            else interim += transcript;
        }
        onInterimText(interim.trim());
    };

    recognition.onerror = (event) => {
        // "no-speech" and "aborted" are routine (silence, or stop() mid-phrase).
        if (event.error === "no-speech" || event.error === "aborted") return;
        setListening(false);
        onError(
            event.error === "not-allowed" || event.error === "service-not-allowed"
                ? "Microphone access was blocked. Allow it in the browser's site settings to answer out loud."
                : `Voice input stopped (${event.error}).`
        );
    };

    // Chrome ends the session on its own after a stretch of silence; keep
    // going until the user turns the mic off.
    recognition.onend = () => {
        onInterimText("");
        if (!listening) return;
        try {
            recognition.start();
        } catch (err) {
            setListening(false);
        }
    };

    return {
        get listening() {
            return listening;
        },
        start() {
            if (listening) return;
            setListening(true);
            recognition.start();
        },
        stop() {
            if (!listening) return;
            setListening(false);
            recognition.stop();
        },
    };
}
