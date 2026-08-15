using UnityEngine;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace VRMCompanion
{
    /// <summary>
    /// 5. CompanionDialogController — LLM-powered NPC dialog.
    /// Priority: 5 (biggest differentiator)
    /// </summary>
    public class CompanionDialogController : MonoBehaviour
    {
        public static CompanionDialogController Instance { get; private set; }

        [Header("NPC Configuration")]
        public string npcPersonalityId = "6a80557a0145fadec0db152f"; // Aria
        public string avatarSlotId = "";
        public string currentSessionId = "";

        [Header("Context")]
        public string currentLocation = "living_room";
        public float proximity = 2.0f;
        public string lastGesture = "";

        [Header("Avatar References")]
        public VRMBlendShapeProxy blendShapeProxy;
        public AudioSource audioSource;

        private const string ENDPOINT = "companionDialog";
        private float lastInteractionTime;

        void Awake()
        {
            if (Instance == null) { Instance = this; }
            else { Destroy(gameObject); }
        }

        /// <summary>
        /// Send user message to LLM and get NPC response.
        /// Call this from voice input or text input.
        /// </summary>
        public async Task<DialogResponse> SendMessage(string userMessage)
        {
            string timeOfDay = GetTimeOfDay();

            var payload = new DialogRequest
            {
                session_id = currentSessionId,
                npc_personality_id = npcPersonalityId,
                avatar_slot_id = avatarSlotId,
                user_message = userMessage,
                context = new DialogContext
                {
                    location = currentLocation,
                    time_of_day = timeOfDay,
                    proximity = proximity,
                    user_gesture = lastGesture
                }
            };

            var resp = await BackendApiClient.PostAsync<DialogResponse>(ENDPOINT, payload);

            if (resp != null)
            {
                currentSessionId = resp.session_id;
                HandleResponse(resp);
                lastInteractionTime = Time.time;
            }

            return resp;
        }

        void HandleResponse(DialogResponse resp)
        {
            // 1. Update facial expression via VRM BlendShape
            ApplyEmotion(resp.emotion);

            // 2. Trigger pose animation
            if (!string.IsNullOrEmpty(resp.pose))
                PoseAnimationController.Instance?.PlayFromDialog(resp.pose);

            // 3. Trigger TTS + LipSync (if audio source available)
            if (audioSource != null && !string.IsNullOrEmpty(resp.reply))
                TriggerTTS(resp.reply);

            Debug.Log($"[Dialog] Reply: {resp.reply}\nEmotion: {resp.emotion} | Pose: {resp.pose} | Mood: {resp.mood}");
        }

        void ApplyEmotion(string emotion)
        {
            if (blendShapeProxy == null) return;

            // Map emotion to VRM BlendShape values
            // VRM standard BlendShapes: Joy, Angry, Sad, Surprised, Relaxed
            switch (emotion)
            {
                case "happy":
                case "excited":
                    SetBlendShape("Joy", 0.8f);
                    SetBlendShape("Surprised", emotion == "excited" ? 0.5f : 0);
                    break;
                case "sad":
                    SetBlendShape("Sad", 0.7f);
                    break;
                case "curious":
                    SetBlendShape("Surprised", 0.3f);
                    SetBlendShape("Joy", 0.2f);
                    break;
                case "calm":
                    SetBlendShape("Relaxed", 0.6f);
                    break;
                case "playful":
                    SetBlendShape("Joy", 0.5f);
                    break;
                default:
                    SetBlendShape("Neutral", 0.3f);
                    break;
            }
        }

        void SetBlendShape(string key, float value)
        {
            // VRM BlendShapeProxy usage:
            // var blendShapeKey = new BlendShapeKey(key);
            // blendShapeProxy.SetValues(new Dictionary<BlendShapeKey, float> { { blendShapeKey, value } });
            Debug.Log($"[BlendShape] {key} = {value}");
        }

        void TriggerTTS(string text)
        {
            // Option A: Quest TTS (Oculus.Platform.Tts)
            // Option B: External TTS via API
            // Option C: Pre-generated audio clips

            // For now, just log — integrate OVRLipSync when audio is available
            Debug.Log($"[TTS] {text}");
        }

        string GetTimeOfDay()
        {
            int hour = System.DateTime.Now.Hour;
            if (hour < 6) return "night";
            if (hour < 12) return "morning";
            if (hour < 18) return "afternoon";
            return "evening";
        }

        public void OnProximityChanged(float newProximity)
        {
            proximity = newProximity;
        }

        public void OnGestureDetected(string gesture)
        {
            lastGesture = gesture;
        }
    }

    // Request/Response DTOs
    [System.Serializable]
    public class DialogRequest
    {
        public string session_id;
        public string npc_personality_id;
        public string avatar_slot_id;
        public string user_message;
        public DialogContext context;
    }

    [System.Serializable]
    public class DialogContext
    {
        public string location;
        public string time_of_day;
        public float proximity;
        public string user_gesture;
    }

    [System.Serializable]
    public class DialogResponse
    {
        public string reply;
        public string emotion;
        public string pose;
        public string mood;
        public string session_id;
    }
}
