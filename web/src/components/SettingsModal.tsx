import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Server,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  X,
  Cpu,
  Radio,
  ExternalLink,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  getConfig,
  saveConfig,
  ProviderMode,
  getResolvedBackendUrl,
} from "../utils/config";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOnboarding?: boolean;
  onSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isOnboarding = false,
  onSaved,
}) => {
  const [providerMode, setProviderMode] = useState<ProviderMode>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [gemmaEndpoint, setGemmaEndpoint] = useState("http://localhost:11434");
  const [gemmaModel, setGemmaModel] = useState("gemma4:2b");
  const [backendUrl, setBackendUrl] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const cfg = getConfig();
      setProviderMode(cfg.providerMode);
      setApiKey(cfg.apiKey);
      setGemmaEndpoint(cfg.gemmaEndpoint);
      setGemmaModel(cfg.gemmaModel || "gemma4:2b");
      setBackendUrl(cfg.backendUrl);
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveConfig({
      providerMode,
      apiKey: apiKey.trim(),
      gemmaEndpoint: gemmaEndpoint.trim(),
      gemmaModel: gemmaModel.trim() || "gemma4:2b",
      backendUrl: backendUrl.trim(),
      hasOnboarded: true,
    });

    setSavedSuccess(true);
    if (onSaved) onSaved();

    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  const detectedBackend = getResolvedBackendUrl();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              {isOnboarding ? (
                <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
              ) : (
                <Cpu className="w-5 h-5 text-indigo-400" />
              )}
            </div>
            <div>
              <h2
                id="settings-modal-title"
                className="text-lg font-bold text-white tracking-wide"
              >
                {isOnboarding
                  ? "Configuración Inicial de LOCE"
                  : "Configuración de LOCE"}
              </h2>
              <p className="text-xs text-slate-400">
                {isOnboarding
                  ? "Configurá tu motor de Inteligencia Artificial para comenzar"
                  : "Gestioná tus credenciales de IA y conexión al backend"}
              </p>
            </div>
          </div>

          {!isOnboarding && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {isOnboarding && (
            <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-800/40 flex items-start gap-3">
              <Zap className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 leading-relaxed">
                <span className="font-semibold text-white">
                  ¡Te damos la bienvenida a LOCE!
                </span>{" "}
                Podés usar tu propia clave de <strong>Gemini Live API</strong>,
                conectar un modelo local <strong>Gemma 4</strong> vía Ollama, o
                probar el sistema de inmediato en <strong>Modo Demostración</strong>.
              </div>
            </div>
          )}

          {/* Engine Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5">
              Motor de Inferencia de IA
            </label>
            <div className="grid grid-cols-1 gap-2.5">
              {/* Gemini Live */}
              <button
                type="button"
                onClick={() => setProviderMode("gemini")}
                className={`text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                  providerMode === "gemini"
                    ? "bg-indigo-950/50 border-indigo-500/80 shadow-lg shadow-indigo-950/30"
                    : "bg-slate-800/50 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600"
                }`}
              >
                <div
                  className={`p-2 rounded-lg mt-0.5 ${
                    providerMode === "gemini"
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  <Zap className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      ⚡ Gemini Live Cloud
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Subtitulado y traducción simultánea ultra-rápida vía Google AI
                    Studio (Bidi streaming).
                  </p>
                </div>
              </button>

              {/* Gemma 4 Local */}
              <button
                type="button"
                onClick={() => setProviderMode("gemma")}
                className={`text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                  providerMode === "gemma"
                    ? "bg-emerald-950/50 border-emerald-500/80 shadow-lg shadow-emerald-950/30"
                    : "bg-slate-800/50 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600"
                }`}
              >
                <div
                  className={`p-2 rounded-lg mt-0.5 ${
                    providerMode === "gemma"
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      🔒 Gemma 4 Local (Edge / Air-Gapped)
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      100% On-Premise
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Inferencia soberana en tu máquina o servidor GPU local sin
                    salida a internet (Ollama / vLLM).
                  </p>
                </div>
              </button>

              {/* Mock Mode */}
              <button
                type="button"
                onClick={() => setProviderMode("mock")}
                className={`text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                  providerMode === "mock"
                    ? "bg-amber-950/50 border-amber-500/80 shadow-lg shadow-amber-950/30"
                    : "bg-slate-800/50 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600"
                }`}
              >
                <div
                  className={`p-2 rounded-lg mt-0.5 ${
                    providerMode === "mock"
                      ? "bg-amber-500 text-white"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  <Radio className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      🧪 Modo Demostración (Mock)
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Zero-Config
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Simulación sintética en 8 idiomas. No requiere claves de API
                    ni servidores locales de inferencia.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Conditional Credentials / Settings */}
          {providerMode === "gemini" && (
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/70 space-y-3 animate-in fade-in-50 duration-150">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="gemini-api-key"
                  className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                >
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  Google Gemini API Key
                </label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                >
                  Obtener gratis en Google AI Studio
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="relative">
                <input
                  id="gemini-api-key"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Pegá tu Gemini API Key (AIzaSy...)"
                  className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-white transition-colors"
                  aria-label={showApiKey ? "Ocultar clave" : "Mostrar clave"}
                >
                  {showApiKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Tu clave se almacena exclusivamente en tu navegador (localStorage)
                y se envía de forma cifrada a la sesión activa.
              </p>
            </div>
          )}

          {providerMode === "gemma" && (
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/70 space-y-3.5 animate-in fade-in-50 duration-150">
              <div>
                <label
                  htmlFor="gemma-endpoint"
                  className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                >
                  <Server className="w-3.5 h-3.5 text-emerald-400" />
                  Endpoint Local de Gemma 4 (Ollama / vLLM)
                </label>
                <input
                  id="gemma-endpoint"
                  type="text"
                  value={gemmaEndpoint}
                  onChange={(e) => setGemmaEndpoint(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full mt-1.5 px-3.5 py-2.5 text-sm rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-mono"
                />
              </div>

              <div>
                <label
                  htmlFor="gemma-model"
                  className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                >
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  Modelo de Gemma 4
                </label>
                <input
                  id="gemma-model"
                  type="text"
                  value={gemmaModel}
                  onChange={(e) => setGemmaModel(e.target.value)}
                  placeholder="gemma4:2b"
                  className="w-full mt-1.5 px-3.5 py-2.5 text-sm rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Compatible con Gemma 4 (2B/4B Edge y 12B Unificado) vía Ollama o vLLM.
                </p>
              </div>

              <div className="pt-1 border-t border-slate-700/50">
                <p className="text-[11px] text-slate-400">
                  Asegurate de haber ejecutado{" "}
                  <code className="px-1.5 py-0.5 rounded bg-slate-900 text-emerald-400 font-mono text-[10px]">
                    ollama run gemma4:2b
                  </code>{" "}
                  en tu terminal.
                </p>
              </div>
            </div>
          )}

          {/* Backend Connection */}
          <div className="space-y-2 pt-1 border-t border-slate-800">
            <label
              htmlFor="backend-url"
              className="text-xs font-semibold text-slate-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-slate-400" />
                Servidor Backend de LOCE (Opcional)
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                Detectado: {detectedBackend}
              </span>
            </label>
            <input
              id="backend-url"
              type="text"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="http://localhost:8000 o https://tu-backend.railway.app (Vacío = mismo host)"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all font-mono"
            />
            <p className="text-[11px] text-slate-400">
              Permite conectar el frontend (p. ej. alojado en Vercel) con un
              servidor backend remoto en la nube o en tu red local.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            {!isOnboarding && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            )}

            <button
              type="submit"
              disabled={savedSuccess}
              className={`px-5 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 shadow-lg ${
                savedSuccess
                  ? "bg-emerald-600 text-white shadow-emerald-900/30"
                  : "bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white shadow-indigo-950/40"
              }`}
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 animate-in zoom-in" />
                  <span>¡Configuración Guardada!</span>
                </>
              ) : (
                <span>
                  {isOnboarding
                    ? "Guardar y Comenzar"
                    : "Guardar Cambios"}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
