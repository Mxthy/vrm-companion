using UnityEngine;
using UnityEngine.Networking;
using System;
using System.Threading.Tasks;

namespace VRMCompanion
{
    /// <summary>
    /// Central API client for all backend calls.
    /// Base URL: https://elowen-0ac850db.base44.app/functions/
    /// </summary>
    public static class BackendApiClient
    {
        private const string BASE_URL = "https://elowen-0ac850db.base44.app/functions/";

        public static async Task<T> PostAsync<T>(string endpoint, object payload) where T : class
        {
            string json = JsonUtility.ToJson(payload);
            // For complex objects, use Newtonsoft if available
            #if VRM_USE_NEWTONSOFT
            json = Newtonsoft.Json.JsonConvert.SerializeObject(payload);
            #endif

            using var req = new UnityWebRequest(BASE_URL + endpoint, "POST");
            req.uploadHandler = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(json));
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            req.timeout = 15;

            var tcs = new TaskCompletionSource<T>();
            req.SendWebRequest().completed += _ =>
            {
                if (req.result == UnityWebRequest.Result.Success)
                {
                    try
                    {
                        var response = JsonUtility.FromJson<T>(req.downloadHandler.text);
                        #if VRM_USE_NEWTONSOFT
                        response = Newtonsoft.Json.JsonConvert.DeserializeObject<T>(req.downloadHandler.text);
                        #endif
                        tcs.SetResult(response);
                    }
                    catch (Exception e)
                    {
                        Debug.LogError($"API parse error: {e.Message}");
                        tcs.SetResult(null);
                    }
                }
                else
                {
                    Debug.LogError($"API error ({endpoint}): {req.error}");
                    tcs.SetResult(null);
                }
            };

            return await tcs.Task;
        }
    }
}
