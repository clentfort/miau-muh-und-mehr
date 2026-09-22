import { useEventListener } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { loadInstalledLibrary, syncLibrary, type SyncStatus } from './src/library';
import { displayName, matchesSearch, shuffleClips } from './src/playback';
import {
  loadHomeLayout,
  loadLastPlayed,
  saveHomeLayout,
  saveLastPlayed,
} from './src/preferences';
import type { HomeLayout, LocalAnimal, LocalClip, LocalLibrary } from './src/types';

const COLORS = {
  background: '#fff7df',
  card: '#ffffff',
  ink: '#2d261d',
  muted: '#786d5d',
  border: '#ead8aa',
  accent: '#d96b38',
  accentSoft: '#f7cda1',
  forest: '#315b43',
};

interface Playback {
  animal: LocalAnimal;
  clips: LocalClip[];
  index: number;
}

function ClipPlayer({
  clip,
  onEnd,
  onStarted,
}: {
  clip: LocalClip;
  onEnd: () => void;
  onStarted: () => void;
}) {
  const ended = useRef(false);
  const finish = useCallback(() => {
    if (!ended.current) {
      ended.current = true;
      onEnd();
    }
  }, [onEnd]);

  const player = useVideoPlayer(clip.localUri, (instance) => {
    instance.loop = false;
    instance.play();
  });

  useEffect(() => {
    onStarted();
  }, [onStarted]);

  useEventListener(player, 'playToEnd', finish);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') {
      finish();
    }
  });

  return (
    <VideoView
      accessibilityLabel="Tiervideo"
      contentFit="contain"
      nativeControls={false}
      player={player}
      style={styles.video}
    />
  );
}

function PlaybackScreen({
  playback,
  onAdvance,
  onClose,
}: {
  playback: Playback;
  onAdvance: () => void;
  onClose: () => void;
}) {
  const clip = playback.clips[playback.index];
  const handleStarted = useCallback(() => {
    void saveLastPlayed(playback.animal.id, clip.id);
  }, [clip.id, playback.animal.id]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.playbackScreen}>
      <StatusBar hidden />
      <ClipPlayer
        key={`${playback.animal.id}-${clip.id}`}
        clip={clip}
        onEnd={onAdvance}
        onStarted={handleStarted}
      />
      <View pointerEvents="box-none" style={styles.playerOverlay}>
        <View style={styles.playerLabel}>
          <Text style={styles.playerAnimal}>{displayName(playback.animal)}</Text>
          <Text style={styles.playerCount}>
            {playback.index + 1} / {playback.clips.length}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Video schließen"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Text style={styles.closeButtonText}>×</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function AnimalImage({ animal, style }: { animal: LocalAnimal; style: object }) {
  return <Image resizeMode="cover" source={{ uri: animal.coverUri }} style={style} />;
}

function GridView({ animals, onSelect }: AnimalViewProps) {
  return (
    <FlatList
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.contentBottom}
      data={animals}
      keyExtractor={(animal) => animal.id}
      keyboardShouldPersistTaps="handled"
      numColumns={2}
      renderItem={({ item }) => (
        <Pressable
          accessibilityLabel={`${displayName(item)} abspielen`}
          accessibilityRole="button"
          onLongPress={() => onSelect(item)}
          onPress={() => onSelect(item)}
          style={({ pressed }) => [styles.gridCard, pressed && styles.cardPressed]}
        >
          <AnimalImage animal={item} style={styles.gridImage} />
          <View style={styles.imageShade} />
          <Text style={styles.gridName}>{displayName(item)}</Text>
        </Pressable>
      )}
      showsVerticalScrollIndicator={false}
    />
  );
}

function ListView({ animals, onSelect }: AnimalViewProps) {
  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={animals}
      keyExtractor={(animal) => animal.id}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <Pressable
          accessibilityLabel={`${displayName(item)} abspielen`}
          accessibilityRole="button"
          onLongPress={() => onSelect(item)}
          onPress={() => onSelect(item)}
          style={({ pressed }) => [styles.listCard, pressed && styles.cardPressed]}
        >
          <AnimalImage animal={item} style={styles.listImage} />
          <Text style={styles.listName}>{displayName(item)}</Text>
          <View style={styles.playCircle}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </Pressable>
      )}
      showsVerticalScrollIndicator={false}
    />
  );
}

function CarouselView({ animals, onSelect }: AnimalViewProps) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 40;

  return (
    <FlatList
      contentContainerStyle={styles.carouselContent}
      data={animals}
      decelerationRate="fast"
      horizontal
      keyExtractor={(animal) => animal.id}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <Pressable
          accessibilityLabel={`${displayName(item)} abspielen`}
          accessibilityRole="button"
          onLongPress={() => onSelect(item)}
          onPress={() => onSelect(item)}
          style={({ pressed }) => [
            styles.carouselCard,
            { width: cardWidth },
            pressed && styles.cardPressed,
          ]}
        >
          <AnimalImage animal={item} style={styles.carouselImage} />
          <View style={styles.carouselShade} />
          <View style={styles.carouselLabel}>
            <Text style={styles.carouselName}>{displayName(item)}</Text>
            <Text style={styles.carouselHint}>Antippen zum Abspielen</Text>
          </View>
        </Pressable>
      )}
      showsHorizontalScrollIndicator={false}
      snapToAlignment="start"
      style={styles.carouselList}
      snapToInterval={cardWidth + 12}
    />
  );
}

interface AnimalViewProps {
  animals: LocalAnimal[];
  onSelect: (animal: LocalAnimal) => void;
}

function LayoutSettings({
  layout,
  visible,
  onChange,
  onClose,
}: {
  layout: HomeLayout;
  visible: boolean;
  onChange: (layout: HomeLayout) => void;
  onClose: () => void;
}) {
  const choices: Array<{ id: HomeLayout; icon: string; label: string }> = [
    { id: 'grid', icon: '▦', label: 'Kacheln' },
    { id: 'carousel', icon: '▣', label: 'Karussell' },
    { id: 'list', icon: '☷', label: 'Liste' },
  ];

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <View onStartShouldSetResponder={() => true} style={styles.settingsCard}>
          <Text style={styles.settingsEyebrow}>EINSTELLUNGEN</Text>
          <Text style={styles.settingsTitle}>Startansicht</Text>
          <Text style={styles.settingsDescription}>
            Wähle aus, wie die Tiere angezeigt werden.
          </Text>
          <View style={styles.layoutChoices}>
            {choices.map((choice) => {
              const selected = layout === choice.id;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={choice.id}
                  onPress={() => onChange(choice.id)}
                  style={({ pressed }) => [
                    styles.layoutChoice,
                    selected && styles.layoutChoiceSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.layoutIcon, selected && styles.layoutTextSelected]}>
                    {choice.icon}
                  </Text>
                  <Text style={[styles.layoutLabel, selected && styles.layoutTextSelected]}>
                    {choice.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.exitAppSection}>
            <Text style={styles.exitAppDescription}>
              Beendet die Anwendung, um zum Startbildschirm zurückzukehren.
            </Text>
            <Pressable
              accessibilityLabel="App beenden"
              accessibilityRole="button"
              onPress={() => BackHandler.exitApp()}
              style={({ pressed }) => [styles.exitAppButton, pressed && styles.pressed]}
            >
              <Text style={styles.exitAppButtonText}>App beenden</Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} style={styles.doneButton}>
            <Text style={styles.doneButtonText}>Fertig</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function StatusMessage({ status }: { status: SyncStatus }) {
  if (status.kind === 'checking') {
    return <Text style={styles.syncText}>Neue Tierstimmen werden gesucht …</Text>;
  }
  if (status.kind === 'downloading') {
    return (
      <Text style={styles.syncText}>
        Inhalte werden geladen: {status.completed}/{status.total}
      </Text>
    );
  }
  if (status.kind === 'wifi-required') {
    return <Text style={styles.syncText}>Updates werden im WLAN geladen.</Text>;
  }
  if (status.kind === 'error') {
    return <Text style={styles.syncError}>Update derzeit nicht verfügbar.</Text>;
  }
  return null;
}

function HomeScreen() {
  const [library, setLibrary] = useState<LocalLibrary | null>(null);
  const [layout, setLayout] = useState<HomeLayout>('grid');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SyncStatus>({ kind: 'idle' });
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const updated = await syncLibrary(setStatus);
    if (updated) {
      setLibrary(updated);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([loadInstalledLibrary(), loadHomeLayout()]).then(
      ([installed, storedLayout]) => {
        if (!active) return;
        setLibrary(installed);
        setLayout(storedLayout);
        setReady(true);
        void refresh();
      },
    );
    return () => {
      active = false;
    };
  }, [refresh]);

  const animals = useMemo(
    () => library?.animals.filter((animal) => matchesSearch(animal, query)) ?? [],
    [library, query],
  );

  const selectAnimal = useCallback(async (animal: LocalAnimal) => {
    const lastPlayed = await loadLastPlayed(animal.id);
    const clips = shuffleClips(animal.clips, lastPlayed);
    if (clips.length > 0) {
      setPlayback({ animal, clips, index: 0 });
    }
  }, []);

  const changeLayout = useCallback((nextLayout: HomeLayout) => {
    setLayout(nextLayout);
    void saveHomeLayout(nextLayout);
  }, []);

  const advancePlayback = useCallback(() => {
    setPlayback((current) => {
      if (!current || current.index + 1 >= current.clips.length) {
        return null;
      }
      return { ...current, index: current.index + 1 };
    });
  }, []);

  const closePlayback = useCallback(() => {
    setPlayback(null);
  }, []);

  if (!ready || !library) {
    const needsWifi = ready && status.kind === 'wifi-required';
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.emptyScreen}>
        <StatusBar hidden />
        <View style={styles.emptyMark}>
          <Text style={styles.emptyMarkText}>♪</Text>
        </View>
        <Text style={styles.emptyTitle}>Miau, Muh und Mehr</Text>
        <Text style={styles.emptyText}>
          {needsWifi
            ? 'Verbinde dich mit einem WLAN, um die Tierstimmen herunterzuladen.'
            : status.kind === 'error'
              ? `Download fehlgeschlagen: ${status.message}`
              : 'Die Tierstimmen werden vorbereitet.'}
        </Text>
        {status.kind !== 'wifi-required' && status.kind !== 'error' ? (
          <ActivityIndicator color={COLORS.accent} size="large" />
        ) : (
          <Pressable onPress={() => void refresh()} style={styles.retryButton}>
            <Text style={styles.retryText}>Erneut versuchen</Text>
          </Pressable>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.home}>
      <StatusBar hidden />
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.kicker}>HÖR MAL!</Text>
            <Text style={styles.title}>Miau, Muh und Mehr</Text>
          </View>
          <Pressable
            accessibilityLabel="Einstellungen öffnen"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setSettingsVisible(true)}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
          >
            <Text style={styles.settingsButtonText}>⚙</Text>
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel="Tier suchen"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setQuery}
            placeholder="Tier suchen …"
            placeholderTextColor="#9b907f"
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
        </View>
        <StatusMessage status={status} />
      </View>

      {animals.length === 0 ? (
        <ScrollView contentContainerStyle={styles.noResults} keyboardShouldPersistTaps="handled">
          <Text style={styles.noResultsIcon}>?</Text>
          <Text style={styles.noResultsTitle}>Kein Tier gefunden</Text>
          <Text style={styles.noResultsText}>Versuche einen anderen Tiernamen.</Text>
        </ScrollView>
      ) : layout === 'grid' ? (
        <GridView animals={animals} onSelect={selectAnimal} />
      ) : layout === 'carousel' ? (
        <CarouselView animals={animals} onSelect={selectAnimal} />
      ) : (
        <ListView animals={animals} onSelect={selectAnimal} />
      )}

      <LayoutSettings
        layout={layout}
        onChange={changeLayout}
        onClose={() => setSettingsVisible(false)}
        visible={settingsVisible}
      />

      <Modal
        animationType="fade"
        onRequestClose={closePlayback}
        statusBarTranslucent
        visible={playback !== null}
      >
        {playback ? (
          <PlaybackScreen
            onAdvance={advancePlayback}
            onClose={closePlayback}
            playback={playback}
          />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <HomeScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  home: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 18, paddingBottom: 12 },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  kicker: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.2,
    marginBottom: 2,
  },
  title: {
    color: COLORS.ink,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  settingsButton: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 22,
    borderWidth: 2,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  settingsButtonText: { color: COLORS.ink, fontSize: 21 },
  searchBox: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 18,
    borderWidth: 2,
    flexDirection: 'row',
    marginTop: 16,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  searchIcon: { color: COLORS.forest, fontSize: 26, fontWeight: '800', marginRight: 8 },
  searchInput: { color: COLORS.ink, flex: 1, fontSize: 17, fontWeight: '600', paddingVertical: 10 },
  syncText: { color: COLORS.muted, fontSize: 12, marginTop: 8, textAlign: 'center' },
  syncError: { color: '#a44b32', fontSize: 12, marginTop: 8, textAlign: 'center' },
  contentBottom: { paddingBottom: 28, paddingHorizontal: 12 },
  gridRow: { gap: 12 },
  gridCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    elevation: 2,
    flex: 1,
    height: 208,
    marginBottom: 12,
    maxWidth: '50%',
    overflow: 'hidden',
  },
  gridImage: { height: '100%', width: '100%' },
  imageShade: {
    backgroundColor: 'rgba(24, 31, 25, 0.47)',
    bottom: 0,
    height: 74,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  gridName: {
    bottom: 17,
    color: '#fff',
    fontSize: 23,
    fontWeight: '900',
    left: 16,
    position: 'absolute',
    right: 12,
  },
  cardPressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  pressed: { opacity: 0.68 },
  listContent: { gap: 10, paddingBottom: 28, paddingHorizontal: 18 },
  listCard: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderColor: '#f0e3c5',
    borderRadius: 20,
    borderWidth: 1,
    elevation: 1,
    flexDirection: 'row',
    minHeight: 92,
    overflow: 'hidden',
    padding: 8,
  },
  listImage: { borderRadius: 15, height: 74, width: 90 },
  listName: { color: COLORS.ink, flex: 1, fontSize: 22, fontWeight: '800', paddingHorizontal: 15 },
  playCircle: {
    alignItems: 'center',
    backgroundColor: COLORS.accentSoft,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginRight: 7,
    width: 44,
  },
  playIcon: { color: COLORS.ink, fontSize: 16, marginLeft: 2 },
  carouselList: { flex: 1 },
  carouselContent: { alignItems: 'center', gap: 12, paddingBottom: 26, paddingHorizontal: 20 },
  carouselCard: {
    borderRadius: 30,
    elevation: 3,
    height: '95%',
    maxHeight: 520,
    minHeight: 390,
    overflow: 'hidden',
  },
  carouselImage: { height: '100%', width: '100%' },
  carouselShade: {
    backgroundColor: 'rgba(18, 28, 23, 0.52)',
    bottom: 0,
    height: 150,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  carouselLabel: { bottom: 29, left: 24, position: 'absolute', right: 24 },
  carouselName: { color: '#fff', fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  carouselHint: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 3, opacity: 0.86 },
  noResults: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', padding: 30 },
  noResultsIcon: {
    backgroundColor: COLORS.accentSoft,
    borderRadius: 36,
    color: COLORS.ink,
    fontSize: 36,
    fontWeight: '900',
    height: 72,
    lineHeight: 72,
    marginBottom: 18,
    textAlign: 'center',
    width: 72,
  },
  noResultsTitle: { color: COLORS.ink, fontSize: 22, fontWeight: '900' },
  noResultsText: { color: COLORS.muted, fontSize: 15, marginTop: 6, textAlign: 'center' },
  modalBackdrop: {
    backgroundColor: 'rgba(37, 29, 20, 0.48)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  settingsCard: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 25,
  },
  settingsEyebrow: { color: COLORS.accent, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  settingsTitle: { color: COLORS.ink, fontSize: 28, fontWeight: '900', marginTop: 4 },
  settingsDescription: { color: COLORS.muted, fontSize: 15, marginTop: 4 },
  layoutChoices: { flexDirection: 'row', gap: 10, marginTop: 20 },
  layoutChoice: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 18,
    borderWidth: 2,
    flex: 1,
    minHeight: 98,
    paddingVertical: 12,
  },
  layoutChoiceSelected: { backgroundColor: COLORS.forest, borderColor: COLORS.forest },
  layoutIcon: { color: COLORS.ink, fontSize: 31, fontWeight: '700' },
  layoutLabel: { color: COLORS.ink, fontSize: 14, fontWeight: '800', marginTop: 5 },
  layoutTextSelected: { color: '#fff' },
  exitAppSection: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 18,
    borderWidth: 2,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  exitAppDescription: { color: COLORS.muted, fontSize: 13, marginBottom: 10 },
  exitAppButton: {
    alignItems: 'center',
    backgroundColor: '#e0533c',
    borderRadius: 12,
    paddingVertical: 12,
  },
  exitAppButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  doneButton: {
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 18,
    marginTop: 18,
    paddingVertical: 15,
  },
  doneButtonText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  playbackScreen: { backgroundColor: '#000', flex: 1 },
  video: { flex: 1 },
  playerOverlay: {
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    padding: 18,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  playerLabel: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    borderRadius: 16,
    marginBottom: 4,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  playerAnimal: { color: '#fff', fontSize: 23, fontWeight: '900' },
  playerCount: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 2, opacity: 0.8 },
  closeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.64)',
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 25,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  closeButtonText: { color: '#fff', fontSize: 38, fontWeight: '300', lineHeight: 40 },
  emptyScreen: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    flex: 1,
    justifyContent: 'center',
    padding: 32,
  },
  emptyMark: {
    alignItems: 'center',
    backgroundColor: COLORS.accentSoft,
    borderRadius: 48,
    height: 96,
    justifyContent: 'center',
    marginBottom: 22,
    transform: [{ rotate: '-7deg' }],
    width: 96,
  },
  emptyMarkText: { color: COLORS.forest, fontSize: 52, fontWeight: '900' },
  emptyTitle: { color: COLORS.ink, fontSize: 29, fontWeight: '900', textAlign: 'center' },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 24,
    marginTop: 9,
    maxWidth: 310,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
