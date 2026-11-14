import { useCallback, useState } from 'react';
import { AnalyticsView } from './components/AnalyticsView';
import { EndSummaryView } from './components/EndSummaryView';
import { MainMenuView } from './components/MainMenuView';
import { SessionView } from './components/SessionView';
import { SettingsView } from './components/SettingsView';
import {
  DEFAULT_CONFIG,
  EquationRecord,
  SessionConfig,
  SessionState,
  UploadedEquationRecord,
  ViewName,
} from './types';
import { validateAndParseCsvFiles } from './utils/csv';
import { unlockSpeechSynthesis } from './utils/speech';

export default function App() {
  const [view, setView] = useState<ViewName>('VIEW_MAIN_MENU');
  const [sessionState, setSessionState] = useState<SessionState>({
    config: DEFAULT_CONFIG,
    accumulatedRecords: [],
    currentRunRecords: [],
  });
  const [runCounter, setRunCounter] = useState(0);

  const [uploadedRecords, setUploadedRecords] = useState<
    UploadedEquationRecord[]
  >([]);
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpdateConfig = useCallback((nextConfig: SessionConfig) => {
    setSessionState((prev) => ({
      ...prev,
      config: nextConfig,
    }));
  }, []);

  const handleStartSession = useCallback((finalConfig: SessionConfig) => {
    setSessionState((prev) => ({
      ...prev,
      config: finalConfig,
      currentRunRecords: [],
    }));
    setRunCounter((c) => c + 1);
    setView('VIEW_SESSION');
  }, []);

  const handleSessionComplete = useCallback((records: EquationRecord[]) => {
    setSessionState((prev) => ({
      ...prev,
      currentRunRecords: records,
      accumulatedRecords: [...prev.accumulatedRecords, ...records],
    }));
    setView('VIEW_END_SUMMARY');
  }, []);

  const handleQuitSession = useCallback(() => {
    setSessionState((prev) => ({
      ...prev,
      currentRunRecords: [],
    }));
    setView('VIEW_SETTINGS');
  }, []);

  const handleReplay = useCallback(() => {
    if (sessionState.config.audioEnabled) {
      unlockSpeechSynthesis();
    }
    setSessionState((prev) => ({
      ...prev,
      currentRunRecords: [],
    }));
    setRunCounter((c) => c + 1);
    setView('VIEW_SESSION');
  }, [sessionState.config.audioEnabled]);

  const handleReturnMainMenu = useCallback(() => {
    setSessionState((prev) => ({
      ...prev,
      accumulatedRecords: [],
      currentRunRecords: [],
    }));
    setUploadError(null);
    setView('VIEW_MAIN_MENU');
  }, []);

  const handleUploadFiles = useCallback(async (fileList: FileList) => {
    setUploadError(null);
    const filesArray = Array.from(fileList);

    try {
      const contents = await Promise.all(
        filesArray.map(async (file) => ({
          name: file.name,
          content: await file.text(),
        }))
      );

      const result = validateAndParseCsvFiles(contents);
      if (!result.valid) {
        setUploadError(
          result.error ||
            'Invalid CSV format: headers or column types do not match app-generated files.'
        );
        return;
      }

      setUploadedRecords(result.records);
      setUploadedFileNames(filesArray.map((f) => f.name));
      setView('VIEW_ANALYTICS');
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? `Could not read uploaded CSV file(s): ${err.message}`
          : 'Could not read uploaded CSV file(s).'
      );
    }
  }, []);

  if (view === 'VIEW_MAIN_MENU') {
    return (
      <MainMenuView
        onStart={() => {
          setUploadError(null);
          setView('VIEW_SETTINGS');
        }}
        onUploadFiles={handleUploadFiles}
        uploadError={uploadError}
        onDismissError={() => setUploadError(null)}
      />
    );
  }

  if (view === 'VIEW_SETTINGS') {
    return (
      <SettingsView
        config={sessionState.config}
        onUpdateConfig={handleUpdateConfig}
        onBack={handleReturnMainMenu}
        onStartSession={handleStartSession}
      />
    );
  }

  if (view === 'VIEW_SESSION') {
    return (
      <SessionView
        key={runCounter}
        config={sessionState.config}
        onQuit={handleQuitSession}
        onComplete={handleSessionComplete}
      />
    );
  }

  if (view === 'VIEW_END_SUMMARY') {
    return (
      <EndSummaryView
        currentRunRecords={sessionState.currentRunRecords}
        accumulatedRecords={sessionState.accumulatedRecords}
        onReplay={handleReplay}
        onMainMenu={handleReturnMainMenu}
      />
    );
  }

  return (
    <AnalyticsView
      records={uploadedRecords}
      fileNames={uploadedFileNames}
      uploadError={uploadError}
      onDismissError={() => setUploadError(null)}
      onUploadFiles={handleUploadFiles}
      onBackToMenu={handleReturnMainMenu}
    />
  );
}
