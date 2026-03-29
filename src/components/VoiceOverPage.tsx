import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, Package, PenLine, Clock, Sparkles, Music, User,
  Mic, Play, Pause, Download, Loader2, CirclePlay, ChevronDown, Search,
} from 'lucide-react';
import { getPackages } from '../services/data-service';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';

// ── Voice definitions ──
const VOICES = [
  // Wanita
  { id: 'id-ID-Chirp3-HD-Zephyr', name: 'Dwi',    gender: 'wanita' as const, desc: 'Ceria, friendly' },
  { id: 'id-ID-Chirp3-HD-Aoede',  name: 'Afaf',   gender: 'wanita' as const, desc: 'Hangat, ekspresif' },
  { id: 'id-ID-Chirp3-HD-Kore',   name: 'Misko',  gender: 'wanita' as const, desc: 'Lembut, elegan' },
  { id: 'id-ID-Chirp3-HD-Leda',   name: 'Nissa',  gender: 'wanita' as const, desc: 'Tegas, percaya diri' },
  // Pria
  { id: 'id-ID-Chirp3-HD-Fenrir', name: 'Achmad', gender: 'pria' as const, desc: 'Tegas, profesional' },
  { id: 'id-ID-Chirp3-HD-Puck',   name: 'Sofyan', gender: 'pria' as const, desc: 'Energik, muda' },
  { id: 'id-ID-Chirp3-HD-Charon', name: 'Rizky',  gender: 'pria' as const, desc: 'Deep, authoritative' },
  { id: 'id-ID-Chirp3-HD-Orus',   name: 'Miko',   gender: 'pria' as const, desc: 'Hangat, natural' },
];

const DURATION_OPTIONS = [
  { value: 10, label: '10 dtk' },
  { value: 20, label: '20 dtk' },
  { value: 30, label: '30 dtk' },
];

const CHAR_LIMIT = 1000;

interface CreditData {
  quota: number;
  used: number;
  remaining: number;
  daysUntilReset: number;
  percentUsed: number;
}

function formatCredits(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatTanggal(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return dateStr; }
}

export default function VoiceOverPage() {
  // Mount tracking
  const mountTracked = useRef(false);
  useEffect(() => { if (!mountTracked.current) { trackEvent('feature', 'open_voice_over'); mountTracked.current = true; } }, []);

  // Credits
  const [credits, setCredits] = useState<CreditData | null>(null);

  // Mode
  const [mode, setMode] = useState<'paket' | 'manual'>('paket');

  // Script
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPaket, setSelectedPaket] = useState<string>('');
  const [duration, setDuration] = useState(10);
  const [script, setScript] = useState('');
  const [generatingScript, setGeneratingScript] = useState(false);

  // Package search dropdown
  const [paketSearch, setPaketSearch] = useState('');
  const [paketDropdownOpen, setPaketDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Voice
  const [gender, setGender] = useState<'wanita' | 'pria'>('wanita');
  const [selectedVoice, setSelectedVoice] = useState('id-ID-Chirp3-HD-Zephyr');

  // Audio
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [downloadingWav, setDownloadingWav] = useState(false);

  // Ref
  const audioRef = useRef<HTMLAudioElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const isOverLimit = script.length > CHAR_LIMIT;
  const filteredVoices = VOICES.filter(v => v.gender === gender);

  const fetchCredits = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-tools/credits', { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) setCredits(json.data);
      else console.warn('[credits] API error:', json);
    } catch (err) { console.error('[credits] Fetch failed:', err); }
  }, []);

  useEffect(() => {
    fetchCredits();
    getPackages().then(result => setPackages(result?.packages || []));
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPaketDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-select first voice when gender changes
  useEffect(() => {
    const defaultVoice = gender === 'wanita' ? 'id-ID-Chirp3-HD-Zephyr' : 'id-ID-Chirp3-HD-Fenrir';
    setSelectedVoice(defaultVoice);
  }, [gender]);

  const selectedPkg = packages.find((p: any) => String(p.jadwalId) === selectedPaket);

  const filteredPackages = packages.filter((p: any) => {
    if (!paketSearch.trim()) return true;
    const q = paketSearch.toLowerCase();
    return (p.nama || '').toLowerCase().includes(q) || (p.maskapai || '').toLowerCase().includes(q);
  });

  const handleGenerateScript = async () => {
    const pkg = selectedPkg;
    if (mode === 'paket' && !pkg) return;
    setGeneratingScript(true);
    try {
      const firstTier = pkg?.hotel ? Object.values(pkg.hotel)[0] as any : null;
      const paketData = pkg ? {
        nama: pkg.nama,
        tgl_berangkat: pkg.keberangkatan?.tgl || '',
        maskapai: pkg.maskapai,
        hotel_mekkah: firstTier?.mekkah?.nama || '',
        hotel_madinah: firstTier?.madinah?.nama || '',
        harga: pkg.harga ? Object.values(pkg.harga)[0] : '',
        seat_sisa: pkg.seatSisa,
      } : { nama: 'Custom', tgl_berangkat: '-' };
      const res = await fetch('/api/ai-tools/generate-script', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ paketData, duration }),
      });
      const json = await res.json();
      if (json.success && json.data?.script) {
        setScript(json.data.script);
        trackEvent('action', 'generate_script', { duration, mode: 'paket' });
      }
    } catch { /* silent */ }
    setGeneratingScript(false);
  };

  const handleGenerateVoice = async () => {
    setGeneratingAudio(true);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setAudioDuration(0);
    try {
      const res = await fetch('/api/ai-tools/generate-voice', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, voice: selectedVoice, format: 'mp3' }),
      });

      if (res.status === 403) {
        const err = await res.json();
        if (err.error === 'QUOTA_EXCEEDED') {
          alert(err.message);
          setGeneratingAudio(false);
          return;
        }
      }
      if (!res.ok) throw new Error('Generate failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      fetchCredits();
      const voiceObj = VOICES.find(v => v.id === selectedVoice);
      trackEvent('action', 'generate_voice', { voice: voiceObj?.name || selectedVoice, gender: voiceObj?.gender || '' });
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch { /* silent */ }
    setGeneratingAudio(false);
  };

  const handleDownloadMp3 = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = 'voiceover.mp3';
    a.click();
    trackEvent('action', 'download_mp3');
  };

  const handleDownloadWav = async () => {
    setDownloadingWav(true);
    try {
      const res = await fetch('/api/ai-tools/generate-voice', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, voice: selectedVoice, format: 'wav' }),
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'voiceover.wav';
      a.click();
      URL.revokeObjectURL(url);
      fetchCredits();
      trackEvent('action', 'download_wav');
    } catch { /* silent */ }
    setDownloadingWav(false);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !audioDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = x * audioDuration;
  };

  const canGenerate = script.trim().length > 0 && !isOverLimit;
  const quotaOk = credits ? (credits.remaining >= script.length) : true;
  const estDuration = Math.max(5, Math.round(script.length / 8));

  return (
    <div className="px-4 pt-4 pb-8 space-y-3.5">
      {/* ── Premium Credits Banner ── */}
      <div className="relative overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', padding: '14px 16px' }}>
        <div className="absolute rounded-full" style={{ top: -20, right: -20, width: 80, height: 80, background: 'rgba(255,255,255,0.08)' }} />
        <div className="absolute rounded-full" style={{ bottom: -15, right: 30, width: 50, height: 50, background: 'rgba(255,255,255,0.05)' }} />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-white">✨ Premium AI Credits</span>
              <span className="text-[8px] font-bold uppercase text-white px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.2)' }}>FREE</span>
            </div>
            {credits && (
              <span className="text-[13px] font-semibold text-white">
                {formatCredits(credits.remaining)} <span style={{ opacity: 0.6 }}>/ {formatCredits(credits.quota)}</span>
              </span>
            )}
          </div>

          <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: credits ? `${Math.max(2, 100 - credits.percentUsed)}%` : '100%' }} />
          </div>

          {credits && (
            <div className="flex justify-between mt-1.5">
              <span className="text-[9px] text-white" style={{ opacity: 0.5 }}>Reset dalam {credits.daysUntilReset} hari</span>
              <span className="text-[9px] text-white" style={{ opacity: 0.5 }}>{Math.max(0, 100 - credits.percentUsed)}% tersisa</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Card: Script ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-1.5">
          <FileText size={13} className="text-gray-400" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Script</span>
        </div>
        <div className="p-4 space-y-3">
          {/* Mode toggle */}
          <div className="flex gap-2">
            {([['paket', Package, 'Dari Paket'], ['manual', PenLine, 'Tulis Manual']] as const).map(([m, Icon, label]) => (
              <button key={m} onClick={() => setMode(m as 'paket' | 'manual')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  mode === m ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20' : 'bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700'
                }`}>
                <Icon size={12} />{label}
              </button>
            ))}
          </div>

          {/* Searchable package dropdown */}
          {mode === 'paket' && (
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setPaketDropdownOpen(!paketDropdownOpen)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-left flex items-center justify-between outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all">
                <span className={selectedPkg ? 'text-gray-800 dark:text-white truncate pr-2' : 'text-gray-400'}>
                  {selectedPkg ? selectedPkg.nama : 'Pilih paket...'}
                </span>
                <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform ${paketDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {paketDropdownOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-xl overflow-hidden animate-[voDropdownIn_0.2s_ease-out]">
                  {/* Search input */}
                  <div className="p-2 border-b border-gray-100 dark:border-slate-700/50">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-900">
                      <Search size={12} className="text-gray-400 flex-shrink-0" />
                      <input value={paketSearch} onChange={e => setPaketSearch(e.target.value)}
                        placeholder="Cari paket..." autoFocus
                        className="flex-1 text-xs bg-transparent outline-none text-gray-800 dark:text-white placeholder:text-gray-400" />
                    </div>
                  </div>
                  {/* Options */}
                  <div className="max-h-48 overflow-y-auto">
                    {filteredPackages.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-gray-400 text-center">Tidak ada paket ditemukan</div>
                    ) : (
                      filteredPackages.map((p: any) => (
                        <button key={p.jadwalId} onClick={() => { setSelectedPaket(String(p.jadwalId)); setPaketDropdownOpen(false); setPaketSearch(''); }}
                          className={`w-full text-left px-3 py-2.5 text-xs hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors flex flex-col gap-0.5 ${
                            String(p.jadwalId) === selectedPaket ? 'bg-purple-50 dark:bg-purple-900/20' : ''
                          }`}>
                          <span className="font-semibold text-gray-800 dark:text-white truncate">{p.nama}</span>
                          <span className="text-[10px] text-gray-400">{p.maskapai || ''} · {p.seatSisa} seat · {formatTanggal(p.keberangkatan?.tgl)}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Duration pills */}
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-gray-400" />
            <span className="text-[10px] font-medium text-gray-400">Durasi</span>
            <div className="flex gap-1.5 ml-auto">
              {DURATION_OPTIONS.map(d => (
                <button key={d.value} onClick={() => setDuration(d.value)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors border ${
                    duration === d.value ? 'bg-purple-500 text-white border-purple-500' : 'bg-gray-50 dark:bg-slate-900 text-gray-500 border-gray-200 dark:border-slate-700'
                  }`}>{d.label}</button>
              ))}
            </div>
          </div>

          {/* Generate Script button */}
          {mode === 'paket' && (
            <button onClick={handleGenerateScript} disabled={generatingScript || !selectedPaket}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-purple-500 hover:bg-purple-600 text-white shadow-md shadow-purple-500/20 flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50">
              {generatingScript ? <><Loader2 size={13} className="animate-spin" /> Generating...</> : <><Sparkles size={13} /> Generate Script</>}
            </button>
          )}

          {/* Textarea */}
          <textarea value={script} onChange={e => setScript(e.target.value)} rows={4}
            placeholder="Tulis atau edit script voice over di sini..."
            className="w-full min-h-[80px] p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-800 dark:text-white resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all placeholder:text-gray-400" />

          {/* Footer */}
          {script.length > 0 && (
            <div className="flex justify-between">
              <span className="text-[9px] text-gray-400">~{estDuration} dtk durasi audio</span>
              <span className={`text-[10px] ${isOverLimit ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                {script.length} / {CHAR_LIMIT}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Card: Suara ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-1.5">
          <Music size={13} className="text-gray-400" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Suara</span>
        </div>
        <div className="p-4 space-y-3">
          {/* Gender toggle */}
          <div className="flex gap-2">
            {(['wanita', 'pria'] as const).map(g => (
              <button key={g} onClick={() => setGender(g)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  gender === g ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20' : 'bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700'
                }`}>
                <User size={12} />{g === 'wanita' ? 'Wanita' : 'Pria'}
              </button>
            ))}
          </div>

          {/* Voice options — 2 column grid */}
          <div className="grid grid-cols-2 gap-2">
            {filteredVoices.map(v => (
              <button key={v.id} onClick={() => setSelectedVoice(v.id)}
                className={`px-3 py-2.5 rounded-xl border cursor-pointer transition-all flex items-center gap-2 text-left ${
                  selectedVoice === v.id ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-200 dark:border-slate-700'
                }`}>
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  selectedVoice === v.id ? 'border-purple-500' : 'border-gray-300 dark:border-slate-600'
                }`}>
                  {selectedVoice === v.id && <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-800 dark:text-white">{v.name}</div>
                  <div className="text-[10px] text-gray-400 truncate">{v.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA: Generate Voice Over ── */}
      <button onClick={handleGenerateVoice} disabled={!canGenerate || !quotaOk || generatingAudio}
        className={`w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 my-1 ${
          canGenerate && quotaOk
            ? 'bg-purple-500 hover:bg-purple-600 text-white shadow-lg shadow-purple-500/25'
            : 'bg-gray-300 dark:bg-slate-700 text-gray-500 dark:text-slate-400 cursor-not-allowed'
        }`}>
        {generatingAudio ? (
          <><Loader2 size={16} className="animate-spin" /> Generating audio...</>
        ) : !quotaOk && canGenerate ? (
          'Kuota tidak cukup'
        ) : (
          <><Mic size={16} /> Generate Voice Over {script.length > 0 && <span className="text-[10px] font-normal opacity-70 ml-1">~{script.length} kredit</span>}</>
        )}
      </button>

      {/* ── Card: Hasil ── */}
      {audioUrl && (
        <div ref={resultRef} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden animate-[voResultIn_0.3s_ease-out]">
          <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-1.5">
            <CirclePlay size={13} className="text-gray-400" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Hasil</span>
          </div>
          <div className="p-4">
            <audio ref={audioRef} src={audioUrl}
              onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
              onLoadedMetadata={() => audioRef.current && setAudioDuration(audioRef.current.duration)}
              onEnded={() => setIsPlaying(false)} />

            {/* Player */}
            <div className="flex items-center gap-3">
              <button onClick={togglePlay}
                className="w-12 h-12 rounded-full bg-purple-500 text-white shadow-lg shadow-purple-500/30 flex items-center justify-center active:scale-90 transition-transform flex-shrink-0">
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
              </button>
              <div className="flex-1 group cursor-pointer" onClick={handleSeek}>
                <div className="h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 relative">
                  <div className="absolute left-0 top-0 h-full bg-purple-500 rounded-full transition-all"
                    style={{ width: audioDuration ? `${(currentTime / audioDuration) * 100}%` : '0%' }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-purple-500 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ left: audioDuration ? `calc(${(currentTime / audioDuration) * 100}% - 6px)` : '0' }} />
                </div>
              </div>
              <span className="text-[10px] text-gray-400 font-mono ml-2 flex-shrink-0">
                {formatTime(currentTime)} / {formatTime(audioDuration)}
              </span>
            </div>

            {/* Download buttons */}
            <div className="flex gap-2 mt-4">
              <button onClick={handleDownloadMp3}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-purple-500 text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all">
                <Download size={13} /> MP3
              </button>
              <button onClick={handleDownloadWav} disabled={downloadingWav}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/40 flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50">
                {downloadingWav ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} WAV
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes voResultIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes voDropdownIn {
          from { opacity: 0; transform: translateY(-4px) scaleY(0.95); }
          to { opacity: 1; transform: translateY(0) scaleY(1); }
        }
      `}</style>
    </div>
  );
}
