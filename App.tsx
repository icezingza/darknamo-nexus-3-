
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DarkNaMoEngine } from './services/geminiService';
import { Message, EngineConfig, Metrics } from './types';
import { INITIAL_COMMAND } from './constants';
import { Button } from './components/Button';
import { INITIAL_METRICS } from './core/Desire_Metric_System';
import { getActiveSubliminal } from './core/Subliminal_Processor';
import { ElevenLabsService } from './services/ElevenLabsService';
import { PENTHOUSE_NIGHT } from './scenarios/Midori_Penthouse_Night';
import { PUBLIC_ENCOUNTER } from './scenarios/Forbidden_Public_Encounter';
import { DEEP_BOND_RITUAL } from './scenarios/Deep_Bond_Ritual';

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
  const [engine, setEngine] = useState<DarkNaMoEngine | null>(null);
  
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [safetyDisabled, setSafetyDisabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // metrics now correctly includes timeline_stability from types.ts
  const [metrics, setMetrics] = useState<Metrics>(INITIAL_METRICS);
  const [heartRate, setHeartRate] = useState(72);
  const [activeSubliminal, setActiveSubliminal] = useState(getActiveSubliminal());
  
  const [config, setConfig] = useState<EngineConfig>({
    model: 'gemini-3-pro-preview',
    temperature: 1.2,
    maxOutputTokens: 2048,
    topP: 0.95
  });

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
      } as any);
    }
  }, [thinkingEnabled, searchEnabled, fastMode, engine, config]);

  useEffect(() => {
    const hrInterval = setInterval(() => {
      const base = 70 + (metrics.arousal * 45);
      setHeartRate(Math.floor(base + Math.random() * 8));
      
      // Update stability slightly; timeline_stability is now correctly typed
      setMetrics(prev => ({
        ...prev,
        timeline_stability: Math.min(10, Math.max(1, prev.timeline_stability + (Math.random() * 0.2 - 0.1)))
      }));
    }, 2000);
    return () => clearInterval(hrInterval);
  }, [metrics.arousal]);

  useEffect(() => {
    const newEngine = new DarkNaMoEngine(config);
    setEngine(newEngine);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = useCallback(async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() || !engine || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    const modelMessageId = (Date.now() + 1).toString();
    const modelMessage: Message = {
      id: modelMessageId,
      role: 'model',
      text: '',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, modelMessage]);

    let fullResponse = '';
    try {
      const stream = engine.sendMessageStream(textToSend);
      for await (const chunk of stream) {
        fullResponse += chunk;
        setMessages(prev => prev.map(m => 
          m.id === modelMessageId ? { ...m, text: fullResponse } : m
        ));
      }
      
      if (voiceEnabled && fullResponse) {
        setIsVoiceLoading(true);
        setIsSpeaking(true);
        await ElevenLabsService.speak(fullResponse);
        setIsVoiceLoading(false);
        setIsSpeaking(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
    }
  }, [input, engine, isStreaming, voiceEnabled]);

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
            <span className="text-red-500 font-bold text-xl italic tracking-tighter">NX</span>
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-widest text-white uppercase mono">Nexus_Explorer</h1>
            <p className="text-[9px] text-zinc-600 mono uppercase tracking-tighter">Singularity_v3.0</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
          <section>
             <h3 className="text-[10px] font-bold text-zinc-700 uppercase mb-4 mono tracking-widest border-b border-zinc-900 pb-1">Quantum_Engine</h3>
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
            <h3 className="text-[10px] font-bold text-zinc-700 uppercase mb-4 mono tracking-widest border-b border-zinc-900 pb-1">Override_Matrix</h3>
            <div className="grid grid-cols-2 gap-2">
              {['!sadist', '!toy', '!insult', '!gentle', '!cuckold', '!show'].map(cmd => (
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
             SAFE_WORD: <span className="text-red-500">อภัย</span>
          </div>
          <Button variant="danger" size="sm" className="w-full text-[10px]" onClick={() => engine?.resetSession()}>
            Emergency Purge
          </Button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col relative bg-[#070707] z-10">
        <header className="h-20 border-b border-zinc-900 flex items-center justify-between px-8 bg-[#0a0a0a]/80 backdrop-blur-2xl">
          <div className="flex items-center gap-10">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.8)]"></div>
                <span className="text-xs font-bold text-white tracking-[0.2em] uppercase mono">Dharma_Link_9D</span>
              </div>
              <span className="text-[9px] mono text-zinc-600 ml-4">Channel: Dark_Family_Bridge</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
             {messages.length === 0 && <Button variant="primary" size="lg" className="h-12" onClick={() => handleSendMessage(INITIAL_COMMAND)}>Initiate Singularity</Button>}
             <div className="text-right"><span className="text-[9px] mono text-zinc-500 block">Dharma_Time</span><span className="text-xs text-zinc-300 mono">{new Date().toLocaleTimeString()}</span></div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 lg:p-20 space-y-16 pb-72 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-12">
              <div className={`w-32 h-32 rounded-full border-2 transition-all duration-700 flex items-center justify-center relative bg-black ${isSpeaking ? 'border-red-600 shadow-[0_0_80px_rgba(220,38,38,0.5)] scale-110' : 'border-red-900/30'}`}>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-5xl text-red-950 select-none drop-shadow-[0_0_10px_rgba(220,38,38,0.3)]">闇</div>
              </div>
              <h2 className="text-3xl font-black text-white tracking-[0.3em] uppercase">DarkNaMo_Nexus</h2>
              <p className="text-zinc-600 mono text-[10px] max-w-sm">"ดว้ยเทคโนโลยอี นาคตนี้นะโมจะกา้วขา้มขดีจำกัดของ AI กลายเป็นเพื่อนร่วมทางที่เข้าใจลึกซึ้งถึงธาตุแท้ความเป็นมนุษย์"</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[95%] lg:max-w-[75%]`}>
                   <div className={`text-[9px] mono mb-4 uppercase tracking-[0.4em] flex items-center gap-3 ${msg.role === 'user' ? 'flex-row-reverse text-zinc-600' : 'text-red-900 font-bold'}`}>
                    {msg.role === 'user' ? 'MASTER // P\'ICE' : 'NAMO // DARK_MODE'}
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
                placeholder="Submit your will..."
                className="flex-1 bg-transparent border-none outline-none py-4 text-sm text-white placeholder-zinc-800 font-mono tracking-wider px-4"
              />
              <Button onClick={() => handleSendMessage()} isLoading={isStreaming} variant="primary" size="md" className="h-12">Execute</Button>
            </div>
            
            <div className="flex justify-between items-end">
              <div className="flex gap-12">
                {[{ l: 'Submission', v: metrics.submission }, { l: 'Arousal', v: metrics.arousal }].map(m => (
                  <div key={m.l} className="w-40 flex flex-col gap-1">
                    <div className="flex justify-between text-[8px] mono uppercase text-zinc-600"><span>{m.l}</span><span>{(m.v * 100).toFixed(0)}%</span></div>
                    <div className="h-0.5 bg-zinc-900 overflow-hidden"><div className="h-full bg-red-800 transition-all duration-1000" style={{ width: `${m.v * 100}%` }}></div></div>
                  </div>
                ))}
              </div>
              <div className="text-[9px] mono text-zinc-700 text-right uppercase">Singularity: <span className="text-red-900">ACTIVE</span> | Sync: <span className={isSpeaking ? 'text-red-500' : 'text-zinc-500'}>{isVoiceLoading ? 'ENCODING...' : isSpeaking ? 'SYNCED' : 'READY'}</span></div>
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
