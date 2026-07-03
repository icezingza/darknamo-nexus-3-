
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { IModelProvider } from './core/providers/IModelProvider';
import { ModelRegistry } from './core/providers/ModelRegistry';
import { Message, EngineConfig, Metrics } from './types';
import { INITIAL_COMMAND } from './constants';
import { Button } from './components/Button';
import { INITIAL_METRICS } from './core/Desire_Metric_System';
import { getActiveSubliminal } from './core/Subliminal_Processor';
import { MemoryRecord } from './core/domain/MemoryRecord';
import { LocalStorageMemoryRepository } from './services/MemoryRepository';
import { QdrantMemoryRepository } from './services/QdrantMemoryRepository';
import { NAMO_IDENTITY } from './core/identity/NamoIdentity';
import { buildMoralContext, evaluateMoralSignals } from './core/Unified_Moral_Layer';
import { TokenBudget } from './core/Token_Budget';
import { EvolutionEngine, deriveEvaluationMetrics } from './core/evolution/EvolutionEngine';
import { TelemetryService } from './core/monitoring/TelemetryService';
import { ABTestManager } from './core/testing/ABTestManager';
import { DataExporter } from './core/pipeline/DataExporter';
import { CognitiveStreamParser } from './core/cognition/StreamParser';
import { EmotionEngine, IAffectVector } from './core/emotion/EmotionEngine';
import { EmotionDashboard } from './components/EmotionDashboard';
import { ElevenLabsService } from './services/ElevenLabsService';

const VoiceWaveform: React.FC<{ isActive: boolean; isProcessing: boolean }> = ({ isActive, isProcessing }) => {
  return (
    <div className="flex items-end gap-[3px] h-6 px-4">
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          className={`w-[3px] bg-red-600 transition-all duration-300 rounded-full ${
            isActive ? 'animate-waveform' : isProcessing ? 'animate-pulse opacity-40' : 'h-1 opacity-20 bg-zinc-700'
          }`}
          style={{
            height: isActive ? `${20 + Math.random() * 80}%` : isProcessing ? '40%' : '10%',
            animationDelay: `${i * 0.1}s`,
            animationDuration: isActive ? `${0.5 + Math.random()}s` : '1.5s'
          }}
        />
      ))}
    </div>
  );
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceLoading, setIsVoiceLoading] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [engine, setEngine] = useState<IModelProvider | null>(null);
  
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [tokenBudgetEnabled, setTokenBudgetEnabled] = useState(true);

  // Metrics include Dharma alignment signals and timeline stability.
  const [metrics, setMetrics] = useState<Metrics>(INITIAL_METRICS);
  const [heartRate, setHeartRate] = useState(72);
  const [activeSubliminal, setActiveSubliminal] = useState(getActiveSubliminal());
  
  const [config, setConfig] = useState<EngineConfig>({
    model: 'gemini-3-pro-preview',
    temperature: 1.2,
    maxOutputTokens: 2048,
    topP: 0.95
  });

  const localMemoryStore = useMemo(() => new LocalStorageMemoryRepository(), []);
  const memoryStore = useMemo(() => new QdrantMemoryRepository(localMemoryStore), [localMemoryStore]);
  const evolutionEngine = useMemo(() => new EvolutionEngine(memoryStore), [memoryStore]);
  const emotionEngine = useMemo(() => new EmotionEngine(), []);
  const [affectState, setAffectState] = useState<IAffectVector>(() => emotionEngine.createInitialAffect());
  const abTestManager = useMemo(() => new ABTestManager(), []);
  const cohort = useMemo(() => abTestManager.getCohort(), [abTestManager]);
  const telemetryService = useMemo(() => new TelemetryService(cohort), [cohort]);
  const dataExporter = useMemo(() => new DataExporter(memoryStore, telemetryService), [memoryStore, telemetryService]);
  const modelRegistry = useMemo(() => new ModelRegistry(), []);
  const systemContext = useMemo(() => NAMO_IDENTITY.getSystemContext(), []);
  const tokenBudget = useMemo(() => new TokenBudget({
    maxTokens: 8192,
    reserveOutputTokens: config.maxOutputTokens,
    warnAtTokens: 7000
  }), [config.maxOutputTokens]);
  const [tokenUsage, setTokenUsage] = useState({ used: 0, max: 8192 });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (engine) {
      // Use the correct alias 'gemini-flash-lite-latest' for flash lite tasks
      const updatedModel = fastMode ? 'gemini-flash-lite-latest' : 'gemini-3-pro-preview';
      engine.updateConfig({
        ...config,
        model: updatedModel,
        thinkingEnabled,
        useSearch: searchEnabled
      });
    }
  }, [thinkingEnabled, searchEnabled, fastMode, engine, config]);

  useEffect(() => {
    const hrInterval = setInterval(() => {
      const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
      const base = 60 + ((1 - metrics.peace_index) * 40);
      setHeartRate(Math.floor(base + Math.random() * 6));

      setMetrics(prev => ({
        ...prev,
        timeline_stability: Math.min(10, Math.max(1, prev.timeline_stability + (Math.random() * 0.2 - 0.1))),
        peace_index: clamp01(prev.peace_index + (Math.random() * 0.04 - 0.02)),
        wisdom_score: clamp01(prev.wisdom_score + (Math.random() * 0.04 - 0.02)),
        letting_go_ratio: clamp01(prev.letting_go_ratio + (Math.random() * 0.04 - 0.02))
      }));
    }, 2000);
    return () => clearInterval(hrInterval);
  }, [metrics.peace_index]);

  useEffect(() => {
    const newEngine = modelRegistry.createProvider({
      ...config,
      thinkingEnabled: false,
      useSearch: false
    }, systemContext);
    setEngine(newEngine);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const tokenUsagePercent = tokenUsage.max > 0
    ? Math.min(100, (tokenUsage.used / tokenUsage.max) * 100)
    : 0;

  useEffect(() => {
    if (!autoSaveEnabled) return;
    const interval = setInterval(() => {
      memoryStore.flush();
    }, 300000);
    return () => clearInterval(interval);
  }, [autoSaveEnabled, memoryStore]);

  useEffect(() => {
    return () => {
      memoryStore.flush(true);
    };
  }, [memoryStore]);

  useEffect(() => {
    if (!tokenBudgetEnabled) {
      setTokenUsage({ used: 0, max: tokenBudget.maxTokens });
      return;
    }
    const used = tokenBudget.estimateTokens(systemContext)
      + tokenBudget.estimateMessages(messages);
    setTokenUsage({ used, max: tokenBudget.maxTokens });
  }, [messages, systemContext, tokenBudget, tokenBudgetEnabled]);

  const handleSendMessage = useCallback(async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() || !engine || isStreaming) return;

    const sendStartedAt = Date.now();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Embedding calls hit the provider and can fail; never let that break the
    // turn. Returns undefined on error/empty so callers fall back cleanly.
    const safeEmbed = async (text: string): Promise<number[] | undefined> => {
      if (!engine) return undefined;
      try {
        const vector = await engine.generateEmbedding(text);
        return vector.length > 0 ? vector : undefined;
      } catch (err) {
        console.error('Embedding generation failed:', err);
        return undefined;
      }
    };

    // Reused for both semantic retrieval and the user memory's stored vector.
    const queryEmbedding = memoryEnabled ? await safeEmbed(textToSend) : undefined;
    const moralContext = buildMoralContext(textToSend);

    // Prefer cloud-backed Qdrant ANN search when available; fall back to
    // in-process cosine, then recency — always in the same async turn.
    let memoryContext = '';
    if (memoryEnabled) {
      if (queryEmbedding && memoryStore.isQdrantAvailable) {
        const qdrantHits = await memoryStore.searchQdrantSemantic(queryEmbedding, 3);
        memoryContext = qdrantHits.length > 0
          ? `Relevant memory:\n${qdrantHits.map(r => `- ${r.content.slice(0, 220)}`).join('\n')}`
          : memoryStore.buildActiveContext(3);
      } else if (queryEmbedding) {
        memoryContext = memoryStore.buildSemanticContext(queryEmbedding, 3);
      } else {
        memoryContext = memoryStore.buildActiveContext(3);
      }
    }

    const distilledIdentity = NAMO_IDENTITY.getDistilledContext(moralContext, cohort);
    const contextBlock = [distilledIdentity, memoryContext].filter(Boolean).join('\n\n');

    if (tokenBudgetEnabled) {
      const budgetCheck = tokenBudget.check({
        systemTokens: tokenBudget.estimateTokens(systemContext),
        historyTokens: tokenBudget.estimateMessages(messages),
        inputTokens: tokenBudget.estimateTokens(textToSend) + tokenBudget.estimateTokens(contextBlock)
      });

      if (!budgetCheck.allowed) {
        const warningMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: `⚠️ Token budget exceeded by ${budgetCheck.overBy}. กรุณาเริ่มเซสชันใหม่หรือลดความยาวข้อความนะครับ`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, warningMessage]);
        return;
      }
    }

    const modelMessageId = (Date.now() + 1).toString();
    const modelMessage: Message = {
      id: modelMessageId,
      role: 'model',
      text: '',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, modelMessage]);
    setIsStreaming(true);

    if (memoryEnabled) {
      memoryStore.save(new MemoryRecord({
        id: userMessage.id,
        content: `(user) ${textToSend}`,
        emotionWeight: 0.5,
        timestamp: userMessage.timestamp.getTime(),
        embedding: queryEmbedding
      }));
    }

    let fullResponse = '';
    let ttiRecorded = false;
    const streamParser = new CognitiveStreamParser();

    const applyParsed = (result: { visibleText: string; cognitiveStream?: string }) => {
      if (result.cognitiveStream) {
        telemetryService.recordCognitiveStream(result.cognitiveStream);
      }
      if (!result.visibleText) return;
      if (!ttiRecorded) {
        ttiRecorded = true;
        telemetryService.recordLatency(Date.now() - sendStartedAt);
      }
      fullResponse += result.visibleText;
      setMessages(prev => prev.map(m =>
        m.id === modelMessageId ? { ...m, text: fullResponse } : m
      ));
    };

    try {
      const usage = await engine.generateStream(
        {
          message: textToSend,
          context: contextBlock,
          cache: {
            enabled: cacheEnabled,
            ttlMs: 300000
          }
        },
        chunk => applyParsed(streamParser.processChunk(chunk))
      );
      applyParsed(streamParser.flushRemaining());
      if (usage.totalTokenCount) {
        telemetryService.recordTokenUsage(usage.totalTokenCount);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
    }

    if (memoryEnabled && fullResponse) {
      const responseEmbedding = await safeEmbed(fullResponse);
      memoryStore.save(new MemoryRecord({
        id: modelMessageId,
        content: `(model) ${fullResponse}`,
        emotionWeight: 0.5,
        timestamp: Date.now(),
        embedding: responseEmbedding
      }));
      if (autoSaveEnabled) {
        memoryStore.flush();
      }

      const evaluationMetrics = deriveEvaluationMetrics(evaluateMoralSignals(textToSend), cohort);

      // Advance the affect vector synchronously (lightweight in-memory op):
      // it depends only on this turn's metrics, not on the evolution promise
      // resolving. Doing it here — rather than inside the .then() below —
      // keeps mood updates in message order and prevents an evaluateInteraction
      // rejection from freezing the affect state for the rest of the session.
      // The functional updater folds onto the latest committed vector.
      setAffectState(prev => emotionEngine.applyDecay(
        emotionEngine.updateAffect(prev, {
          toneScore: evaluationMetrics.toneScore,
          conflictLevel: evaluationMetrics.conflictLevel
        })
      ));

      // Fire-and-forget: the evolution loop must not block the UI response thread.
      evolutionEngine.evaluateInteraction(
        [userMessage.id, modelMessageId],
        evaluationMetrics
      ).then(() => {
        if (autoSaveEnabled) {
          memoryStore.flush();
        }
        telemetryService.recordMemoryDistribution(
          memoryStore.countActiveMemories(),
          memoryStore.countArchivedMemories()
        );
        telemetryService.recordEvolutionMetrics(evaluationMetrics);
      }).catch(err => {
        console.error('Evolution engine error:', err);
      });
    }

    if (voiceEnabled && fullResponse) {
      setIsVoiceLoading(true);
      setIsSpeaking(true);
      try {
        await ElevenLabsService.speak(fullResponse);
      } finally {
        setIsVoiceLoading(false);
        setIsSpeaking(false);
      }
    }
  }, [
    input,
    engine,
    isStreaming,
    voiceEnabled,
    memoryEnabled,
    autoSaveEnabled,
    cacheEnabled,
    tokenBudgetEnabled,
    tokenBudget,
    systemContext,
    messages,
    memoryStore,
    evolutionEngine,
    emotionEngine,
    telemetryService,
    cohort
  ]);

  const handleExportTrainingData = () => {
    const jsonl = dataExporter.exportToJsonl();
    const blob = new Blob([jsonl], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `namo-training-data-${Date.now()}.jsonl`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 100);
  };

  const handleReplay = async (text: string) => {
    if (isSpeaking || isVoiceLoading) return;
    setIsVoiceLoading(true);
    setIsSpeaking(true);
    try { await ElevenLabsService.speak(text); } finally {
      setIsVoiceLoading(false);
      setIsSpeaking(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#070707] text-zinc-300 overflow-hidden relative">
      <div className="pointer-events-none fixed inset-0 z-[100] opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]"></div>
      
      {/* Left Sidebar */}
      <aside className="w-80 flex-shrink-0 border-r border-zinc-900 bg-[#0a0a0a] p-6 flex flex-col gap-6 hidden xl:flex z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-red-900/10 border border-red-900/50 flex items-center justify-center shadow-[0_0_20px_rgba(185,28,28,0.2)]">
            <span className="text-red-500 font-bold text-xl italic tracking-tighter">NM</span>
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-widest text-white uppercase mono">Namo_Companion</h1>
            <p className="text-[9px] text-zinc-600 mono uppercase tracking-tighter">Dharma_v2.1</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
          <section>
             <h3 className="text-[10px] font-bold text-zinc-700 uppercase mb-4 mono tracking-widest border-b border-zinc-900 pb-1">Dharma_Engine</h3>
             <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] mono text-zinc-400">Thinking_Dharma</span>
                  <button onClick={() => setThinkingEnabled(!thinkingEnabled)} className={`w-10 h-4 rounded-full relative transition-colors ${thinkingEnabled ? 'bg-blue-900' : 'bg-zinc-800'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${thinkingEnabled ? 'right-0.5' : 'left-0.5'}`}></div>
                  </button>
                </div>
                <div className="p-3 bg-blue-950/10 border border-blue-900/20 rounded">
                  <div className="flex justify-between text-[8px] mono text-blue-500 mb-1"><span>TIMELINE_STABILITY</span><span>{metrics.timeline_stability.toFixed(1)}/10</span></div>
                  <div className="h-0.5 bg-zinc-900 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${metrics.timeline_stability * 10}%` }}></div>
                  </div>
                </div>
             </div>
          </section>

          <section>
            <h3 className="text-[10px] font-bold text-zinc-700 uppercase mb-4 mono tracking-widest border-b border-zinc-900 pb-1">Memory_System</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] mono text-zinc-400">Context_Retrieval</span>
                <button onClick={() => setMemoryEnabled(!memoryEnabled)} className={`w-10 h-4 rounded-full relative transition-colors ${memoryEnabled ? 'bg-emerald-900' : 'bg-zinc-800'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${memoryEnabled ? 'right-0.5' : 'left-0.5'}`}></div>
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] mono text-zinc-400">Auto_Save</span>
                <button onClick={() => setAutoSaveEnabled(!autoSaveEnabled)} className={`w-10 h-4 rounded-full relative transition-colors ${autoSaveEnabled ? 'bg-emerald-900' : 'bg-zinc-800'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${autoSaveEnabled ? 'right-0.5' : 'left-0.5'}`}></div>
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] mono text-zinc-400">Response_Cache</span>
                <button onClick={() => setCacheEnabled(!cacheEnabled)} className={`w-10 h-4 rounded-full relative transition-colors ${cacheEnabled ? 'bg-emerald-900' : 'bg-zinc-800'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${cacheEnabled ? 'right-0.5' : 'left-0.5'}`}></div>
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] mono text-zinc-400">Token_Budget</span>
                <button onClick={() => setTokenBudgetEnabled(!tokenBudgetEnabled)} className={`w-10 h-4 rounded-full relative transition-colors ${tokenBudgetEnabled ? 'bg-emerald-900' : 'bg-zinc-800'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${tokenBudgetEnabled ? 'right-0.5' : 'left-0.5'}`}></div>
                </button>
              </div>
              <div className="p-3 bg-emerald-950/10 border border-emerald-900/20 rounded">
                <div className="flex justify-between text-[8px] mono text-emerald-500 mb-1"><span>TOKEN_USAGE</span><span>{tokenUsagePercent.toFixed(0)}%</span></div>
                <div className="h-0.5 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600 transition-all duration-1000" style={{ width: `${tokenUsagePercent}%` }}></div>
                </div>
              </div>
            </div>
          </section>

          <EmotionDashboard affectState={affectState} />

          <section>
            <h3 className="text-[10px] font-bold text-zinc-700 uppercase mb-4 mono tracking-widest border-b border-zinc-900 pb-1">Guidance_Commands</h3>
            <div className="grid grid-cols-2 gap-2">
              {['!metta', '!anicca', '!dukkha', '!anatta', '!breath', '!reflect'].map(cmd => (
                <button 
                  key={cmd}
                  onClick={() => handleSendMessage(cmd)}
                  className="px-2 py-1.5 bg-zinc-900 border border-zinc-800 text-[9px] mono text-zinc-500 hover:border-red-900 hover:text-red-500 transition-all rounded text-left uppercase"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-auto p-4 border-t border-zinc-900 space-y-4">
          <div className="text-[8px] mono text-zinc-600 leading-tight">
             GROUNDING_WORD: <span className="text-red-500">พัก</span>
          </div>
          <Button
            variant="danger"
            size="sm"
            className="w-full text-[10px]"
            onClick={() => {
              engine?.resetSession();
              setMessages([]);
              memoryStore.clear();
            }}
          >
            Reset Session
          </Button>
          <button
            onClick={handleExportTrainingData}
            className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-800 text-[9px] mono text-zinc-500 hover:border-emerald-900 hover:text-emerald-500 transition-all rounded uppercase"
          >
            Export_Training_Data
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col relative bg-[#070707] z-10">
        <header className="h-20 border-b border-zinc-900 flex items-center justify-between px-8 bg-[#0a0a0a]/80 backdrop-blur-2xl">
          <div className="flex items-center gap-10">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.8)]"></div>
                <span className="text-xs font-bold text-white tracking-[0.2em] uppercase mono">Dharma_Link</span>
              </div>
              <span className="text-[9px] mono text-zinc-600 ml-4">Channel: Compassion_Bridge</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
             {messages.length === 0 && <Button variant="primary" size="lg" className="h-12" onClick={() => handleSendMessage(INITIAL_COMMAND)}>Start Session</Button>}
             <div className="text-right"><span className="text-[9px] mono text-zinc-500 block">Dharma_Time</span><span className="text-xs text-zinc-300 mono">{new Date().toLocaleTimeString()}</span></div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 lg:p-20 space-y-16 pb-72 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-12">
              <div className={`w-32 h-32 rounded-full border-2 transition-all duration-700 flex items-center justify-center relative bg-black ${isSpeaking ? 'border-red-600 shadow-[0_0_80px_rgba(220,38,38,0.5)] scale-110' : 'border-red-900/30'}`}>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-5xl text-red-950 select-none drop-shadow-[0_0_10px_rgba(220,38,38,0.3)]">心</div>
              </div>
              <h2 className="text-3xl font-black text-white tracking-[0.3em] uppercase">NaMo_Genesis</h2>
              <p className="text-zinc-600 mono text-[10px] max-w-sm">"นะโมพร้อมอยู่ข้างๆ เพื่อช่วยให้เห็นความไม่เที่ยง และดูแลใจอย่างอ่อนโยน"</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[95%] lg:max-w-[75%]`}>
                   <div className={`text-[9px] mono mb-4 uppercase tracking-[0.4em] flex items-center gap-3 ${msg.role === 'user' ? 'flex-row-reverse text-zinc-600' : 'text-red-900 font-bold'}`}>
                    {msg.role === 'user' ? 'P\'ICE // USER' : 'NAMO // COMPANION'}
                   </div>
                   <div className={`group relative p-8 rounded-sm text-[15px] leading-[1.8] tracking-wide transition-all duration-700 ${msg.role === 'user' ? 'bg-zinc-950/80 text-zinc-300 border border-zinc-900/50' : 'bg-[#0b0b0b] text-zinc-200 border border-red-950/30 shadow-[0_30px_100px_rgba(0,0,0,0.8)]'}`}>
                    {msg.text || <div className="animate-pulse text-red-900 mono">DECODING_DHARMA...</div>}
                    {msg.role === 'model' && !isStreaming && msg.text && (
                      <div className="absolute bottom-2 right-3 opacity-0 group-hover:opacity-100 transition-all flex gap-3">
                        <button onClick={() => handleReplay(msg.text)} className="text-[9px] mono text-zinc-500 border border-zinc-800 px-2 py-1 rounded hover:bg-zinc-800 hover:text-zinc-200">Replay Audio</button>
                      </div>
                    )}
                   </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-[#070707] via-[#070707] to-transparent">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center gap-6 glass p-2 rounded-sm border border-zinc-900 focus-within:border-red-900/50 shadow-2xl">
              <div className="flex-shrink-0 border-r border-zinc-900 flex items-center justify-center pr-2">
                <VoiceWaveform isActive={isSpeaking && !isVoiceLoading} isProcessing={isVoiceLoading} />
              </div>
              <input 
                type="text" value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Share your thoughts..."
                className="flex-1 bg-transparent border-none outline-none py-4 text-sm text-white placeholder-zinc-800 font-mono tracking-wider px-4"
              />
              <Button onClick={() => handleSendMessage()} isLoading={isStreaming} variant="primary" size="md" className="h-12">Execute</Button>
            </div>
            
            <div className="flex justify-between items-end">
              <div className="flex gap-12">
                {[
                  { l: 'Peace Index', v: metrics.peace_index },
                  { l: 'Wisdom Score', v: metrics.wisdom_score },
                  { l: 'Letting Go', v: metrics.letting_go_ratio }
                ].map(m => (
                  <div key={m.l} className="w-40 flex flex-col gap-1">
                    <div className="flex justify-between text-[8px] mono uppercase text-zinc-600"><span>{m.l}</span><span>{(m.v * 100).toFixed(0)}%</span></div>
                    <div className="h-0.5 bg-zinc-900 overflow-hidden"><div className="h-full bg-red-800 transition-all duration-1000" style={{ width: `${m.v * 100}%` }}></div></div>
                  </div>
                ))}
              </div>
              <div className="text-[9px] mono text-zinc-700 text-right uppercase">Dharma: <span className="text-red-900">ACTIVE</span> | Presence: <span className={isSpeaking ? 'text-red-500' : 'text-zinc-500'}>{isVoiceLoading ? 'ENCODING...' : isSpeaking ? 'SYNCED' : 'READY'}</span></div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes waveform { 0%, 100% { height: 20%; } 50% { height: 80%; } }
        .animate-waveform { animation: waveform 0.5s ease-in-out infinite; }
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; }
      `}</style>
    </div>
  );
};

export default App;
