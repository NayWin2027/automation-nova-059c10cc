// ... (ယခင် code များအတိုင်းထားပါ - Surgical Edit အပိုင်းမှ စတင်ပါသည်)

// ── SURGICAL EDIT: PROFESSIONAL SERVER RENDER DISPATCHER ──
const processServerRender = async () => {
  setIsRendering(true);
  setServerRenderProgress("INITIATING... 0%");
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id || "guest";
    const exportQ = EXPORT_QUALITY_OPTIONS[exportQuality] || EXPORT_QUALITY_OPTIONS["720p"];

    // 1. Assets Upload (Parallel)
    setServerRenderProgress("UPLOADING ASSETS... 15%");
    const audioBlob = await fetch(audioUrl!).then((r) => r.blob());
    const audioPath = `${userId}/audio_${Date.now()}.mp3`;
    await supabase.storage.from("temp-uploads").upload(audioPath, audioBlob);
    const { data: audioSign } = await supabase.storage.from("temp-uploads").createSignedUrl(audioPath, 3600);

    let videoSignedUrl = "";
    if (videoFileRef.current) {
      const videoPath = `${userId}/source_${Date.now()}.mp4`;
      await supabase.storage.from("temp-uploads").upload(videoPath, videoFileRef.current);
      const { data: videoSign } = await supabase.storage.from("temp-uploads").createSignedUrl(videoPath, 3600);
      videoSignedUrl = videoSign?.signedUrl || "";
    }

    // 2. Dispatch Parallel Render Job
    setServerRenderProgress("DISPATCHING CORES... 30%");
    const dur = videoDurationRef.current || 60;
    const subtitles = scriptData.segments.map((seg, idx) => {
      const ts = pageAudioTimestampsRef.current.find((x) => x.index === idx);
      return { start: ts?.start || 0, end: ts?.end || 0, text: seg.text };
    });

    // Server function ကို Parallel Mode နဲ့ လှမ်းခေါ်ခြင်း
    const { data: jobData, error: jobError } = await supabase.functions.invoke("video-recap", {
      body: {
        action: "triggerServerRender",
        audioUrl: audioSign?.signedUrl,
        videoUrl: videoSignedUrl,
        subtitles: subtitles,
        duration: dur,
        parallelMode: true, // Backend အား Parallel လုပ်ခိုင်းခြင်း
        segmentCount: Math.ceil(dur / 60), // ၁ မိနစ်စီ ခွဲခိုင်းခြင်း
        quality: exportQuality,
      },
    });

    if (jobError || jobData?.error) throw new Error(jobError?.message || jobData?.error);
    const jobId = jobData.jobId;

    // 3. Smart Polling with Premium UI Update
    let pollCount = 0;
    const pollStatus = async () => {
      const { data: statusData } = await supabase.functions.invoke("video-recap", {
        body: { action: "pollServerRender", jobId },
      });

      if (statusData?.state === "done") {
        setRenderedBlobUrl(statusData.url);
        setIsRendering(false);
        toast.success("Professional Recap Rendered Successfully!");
      } else if (statusData?.state === "failed") {
        throw new Error(statusData.error);
      } else {
        // UI Progress Logic: 30% မှ 95% အထိ ချောမွေ့စွာ ပြခြင်း
        const currentProgress = statusData?.progress || 30 + Math.min(65, pollCount * 2);
        const statusText = currentProgress < 85 ? "RENDERING SEGMENTS" : "STITCHING VIDEO";
        setServerRenderProgress(`${statusText}... ${Math.round(currentProgress)}%`);
        pollCount++;
        setTimeout(pollStatus, 2000);
      }
    };
    pollStatus();
  } catch (err: any) {
    toast.error(`Server Error: ${err.message}`);
    setIsRendering(false);
  }
};
// ... (JSX အပိုင်းသို့ သွားပါ)

// ── SURGICAL EDIT: PREMIUM PROGRESS UI ──────────────────────────────────────
{
  isRendering && renderMode === "server" && (
    <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-xl">
      <div className="relative w-72 h-72 flex items-center justify-center">
        {/* Outer Rotating Glow */}
        <div className="absolute inset-0 rounded-full border-2 border-dashed border-amber-500/30 animate-[spin_10s_linear_infinite]" />
        <div className="absolute inset-4 rounded-full border-t-2 border-amber-500 animate-[spin_2s_linear_infinite] shadow-[0_0_15px_#f5a623]" />

        <div className="text-center z-10">
          <div className="text-4xl font-black text-white mb-2 tracking-tighter italic">
            {parseInt(serverRenderProgress.match(/\d+/)?.[0] || "0")}%
          </div>
          <div className="text-[10px] font-bold text-amber-500 tracking-[0.2em] uppercase animate-pulse">
            Nova Engine Processing
          </div>
        </div>
      </div>

      <div className="mt-8 w-64 space-y-2">
        <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          <span>Status</span>
          <span className="text-amber-400">{serverRenderProgress.split("...")[0]}</span>
        </div>
        <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
          <div
            className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 transition-all duration-500 shadow-[0_0_10px_#f5a623]"
            style={{ width: `${parseInt(serverRenderProgress.match(/\d+/)?.[0] || "0")}%` }}
          />
        </div>
        <p className="text-[9px] text-slate-500 text-center leading-relaxed">
          Cloud instances are rendering segments in parallel.
          <br />
          Please do not close this window.
        </p>
      </div>
    </div>
  );
}
