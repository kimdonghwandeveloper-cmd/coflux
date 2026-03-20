import React, { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { Download, RefreshCcw, X } from 'lucide-react';

export const Updater: React.FC = () => {
  const [update, setUpdate] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update) {
          setUpdate(update);
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    };

    checkForUpdates();
  }, []);

  const handleUpdate = async () => {
    if (!update) return;
    setIsUpdating(true);
    try {
      let contentLength = 0;
      let downloaded = 0;
      
      await update.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case 'Finished':
            break;
        }
      });
      await relaunch();
    } catch (error) {
      console.error('Update failed:', error);
      setIsUpdating(false);
    }
  };

  if (!update) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-2xl max-w-sm">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <RefreshCcw className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">새로운 업데이트</h3>
              <p className="text-sm opacity-60">v{update.version}으로 업데이트 가능합니다.</p>
            </div>
          </div>
          <button onClick={() => setUpdate(null)} className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isUpdating ? (
          <div className="space-y-3">
            <div className="h-2 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <p className="text-center text-sm font-medium">{downloadProgress}% 완료...</p>
          </div>
        ) : (
          <button 
            onClick={handleUpdate}
            className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20"
          >
            <Download className="w-5 h-5" />
            지금 설치 및 재시작
          </button>
        )}
      </div>
    </div>
  );
};
