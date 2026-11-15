package com.example.sonora;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.Set;

public class MainActivity extends Activity {
    private static final int BACKGROUND = Color.rgb(18, 20, 19);
    private static final int SURFACE = Color.rgb(36, 39, 37);
    private static final int MUTED = Color.rgb(174, 180, 175);
    private static final int ACCENT = Color.rgb(177, 235, 203);

    private final List<Track> tracks = Arrays.asList(
            new Track("Moonlit Drive", "Mira Sol", "0:24", "☾", 0xff7555a8, 0xff352649, R.raw.moonlit_drive),
            new Track("Small Hours", "The Paper Moons", "0:24", "✳", 0xffdc9077, 0xff774958, R.raw.small_hours),
            new Track("Blue Window", "Juniper Lane", "0:24", "≈", 0xff6ba5bd, 0xff354a72, R.raw.blue_window),
            new Track("Sunday Light", "Owen Vale", "0:24", "☼", 0xffd5ac62, 0xff82523b, R.raw.sunday_light),
            new Track("Quiet Bloom", "Nia Rowan", "0:24", "❋", 0xff87b38d, 0xff386762, R.raw.quiet_bloom),
            new Track("Soft Landing", "Cleo North", "0:24", "✦", 0xffd889b4, 0xff71456d, R.raw.soft_landing)
    );
    private final Set<Integer> favorites = new HashSet<>();
    private final Random random = new Random();
    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private final Runnable progressUpdater = new Runnable() {
        @Override public void run() {
            if (mediaPlayer != null && mediaPlayer.isPlaying()) {
                if (progressBar != null) progressBar.setProgress(mediaPlayer.getCurrentPosition());
                progressHandler.postDelayed(this, 250);
            }
        }
    };

    private LinearLayout pageContent;
    private TextView playerTitle;
    private TextView playerArtist;
    private TextView playerCover;
    private Button playButton;
    private SeekBar progressBar;
    private MediaPlayer mediaPlayer;
    private Track currentTrack;
    private boolean playing;
    private boolean fullPlayerOpen;
    private String currentTab = "Home";
    private String homeFilter = "All";
    private boolean shuffleOn;
    private boolean repeatOne;
    private String libraryFilter = "All songs";
    private int trackChangeDirection;
    private boolean lyricsViewOpen;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        currentTrack = tracks.get(0);
        Set<String> savedFavorites = getSharedPreferences("sonora", MODE_PRIVATE)
                .getStringSet("favorites", Collections.emptySet());
        for (String savedIndex : savedFavorites) {
            try {
                int index = Integer.parseInt(savedIndex);
                if (index >= 0 && index < tracks.size()) favorites.add(index);
            } catch (NumberFormatException exception) {
                android.util.Log.w("Sonora", "Ignoring invalid saved favorite.", exception);
            }
        }
        Window window = getWindow();
        window.setStatusBarColor(BACKGROUND);
        window.setNavigationBarColor(BACKGROUND);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        showApp();
    }

    private void showApp() {
        fullPlayerOpen = false;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BACKGROUND);
        root.setPadding(dp(18), dp(12), dp(18), 0);

        LinearLayout appBar = new LinearLayout(this);
        appBar.setGravity(Gravity.CENTER_VERTICAL);
        TextView mark = text("♫", 19, Color.rgb(23, 45, 33), true);
        mark.setGravity(Gravity.CENTER);
        mark.setBackground(round(ACCENT, dp(11), 0xff85c9a4));
        appBar.addView(mark, new LinearLayout.LayoutParams(dp(34), dp(34)));
        TextView brand = text("SONORA", 15, Color.WHITE, true);
        brand.setLetterSpacing(0.1f);
        LinearLayout.LayoutParams brandParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        brandParams.setMargins(dp(10), 0, 0, 0);
        appBar.addView(brand, brandParams);
        View spacer = new View(this);
        appBar.addView(spacer, new LinearLayout.LayoutParams(0, 1, 1));
        TextView profile = text("A", 13, ACCENT, true);
        profile.setGravity(Gravity.CENTER);
        profile.setBackground(round(SURFACE, dp(18), 0xff454b47));
        appBar.addView(profile, new LinearLayout.LayoutParams(dp(34), dp(34)));
        root.addView(appBar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(50)));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        pageContent = new LinearLayout(this);
        pageContent.setOrientation(LinearLayout.VERTICAL);
        pageContent.setPadding(0, dp(12), 0, dp(14));
        scroll.addView(pageContent);
        root.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        root.addView(createPlayer(), new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(78)));
        root.addView(createNavigation(), new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(62)));
        setContentView(root);
        showTab(currentTab);
    }

    private View createPlayer() {
        LinearLayout player = new LinearLayout(this);
        player.setGravity(Gravity.CENTER_VERTICAL);
        player.setOrientation(LinearLayout.VERTICAL);
        player.setPadding(dp(10), dp(3), dp(9), dp(5));
        player.setBackground(round(SURFACE, dp(16), 0xff51445d));

        progressBar = new SeekBar(this);
        progressBar.setMax(24000);
        progressBar.setProgress(0);
        progressBar.setPadding(dp(2), 0, dp(2), 0);
        progressBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser && mediaPlayer != null) mediaPlayer.seekTo(progress);
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) { }
            @Override public void onStopTrackingTouch(SeekBar seekBar) { }
        });
        player.addView(progressBar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(10)));

        LinearLayout controls = new LinearLayout(this);
        controls.setGravity(Gravity.CENTER_VERTICAL);
        playerCover = text(currentTrack.art, 23, Color.WHITE, true);
        playerCover.setGravity(Gravity.CENTER);
        playerCover.setBackground(round(currentTrack.startColor, dp(12), currentTrack.endColor));
        attachPlayerGesture(playerCover);
        controls.addView(playerCover, new LinearLayout.LayoutParams(dp(46), dp(46)));

        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.setPadding(dp(10), 0, dp(6), 0);
        playerTitle = text(currentTrack.title, 14, Color.WHITE, true);
        playerArtist = text(currentTrack.artist, 12, MUTED, false);
        labels.addView(playerTitle);
        labels.addView(playerArtist);
        attachPlayerGesture(labels);
        controls.addView(labels, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        Button previousButton = button("|◀", SURFACE, Color.WHITE);
        previousButton.setContentDescription("Previous track");
        previousButton.setOnClickListener(view -> playNext(false));
        controls.addView(previousButton, new LinearLayout.LayoutParams(dp(38), dp(42)));

        playButton = button("▶", Color.rgb(238, 229, 255), Color.rgb(35, 29, 47));
        playButton.setContentDescription("Play");
        playButton.setOnClickListener(view -> togglePlayback());
        controls.addView(playButton, new LinearLayout.LayoutParams(dp(42), dp(42)));

        Button nextButton = button("▶|", SURFACE, Color.WHITE);
        nextButton.setContentDescription("Next track");
        nextButton.setOnClickListener(view -> playNext(true));
        controls.addView(nextButton, new LinearLayout.LayoutParams(dp(38), dp(42)));

        player.addView(controls, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        return player;
    }

    private View createNavigation() {
        LinearLayout nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(0, dp(4), 0, dp(7));
        String[] tabs = {"Home", "Search", "Library"};
        String[] icons = {"⌂", "⌕", "▤"};
        for (int i = 0; i < tabs.length; i++) {
            final String tab = tabs[i];
            LinearLayout item = new LinearLayout(this);
            item.setGravity(Gravity.CENTER);
            item.setOrientation(LinearLayout.VERTICAL);
            TextView icon = text(icons[i], 21, tab.equals(currentTab) ? ACCENT : MUTED, false);
            TextView label = text(tab, 11, tab.equals(currentTab) ? ACCENT : MUTED, false);
            item.addView(icon);
            item.addView(label);
            item.setContentDescription(tab);
            item.setOnClickListener(view -> {
                currentTab = tab;
                homeFilter = "All";
                showApp();
            });
            nav.addView(item, new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.MATCH_PARENT, 1));
        }
        return nav;
    }

    private void showTab(String tab) {
        pageContent.removeAllViews();
        if ("Search".equals(tab)) {
            showSearch();
        } else if ("Library".equals(tab)) {
            showLibrary();
        } else {
            showHome();
        }
    }

    private void showLibrary() {
        pageContent.removeAllViews();
        TextView libraryTitle = text("Your Library", 29, Color.WHITE, true);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleParams.setMargins(0, dp(8), 0, dp(14));
        pageContent.addView(libraryTitle, titleParams);

        LinearLayout likedPlaylist = new LinearLayout(this);
        likedPlaylist.setGravity(Gravity.CENTER_VERTICAL);
        likedPlaylist.setPadding(dp(14), dp(14), dp(14), dp(14));
        likedPlaylist.setBackground(round(0xff8754bd, dp(14), 0xff382945));
        TextView heart = text("♥", 36, Color.WHITE, true);
        heart.setGravity(Gravity.CENTER);
        heart.setBackground(round(0xffb995ed, dp(9), 0xff664a91));
        likedPlaylist.addView(heart, new LinearLayout.LayoutParams(dp(76), dp(76)));
        LinearLayout playlistLabels = new LinearLayout(this);
        playlistLabels.setOrientation(LinearLayout.VERTICAL);
        playlistLabels.setPadding(dp(13), 0, 0, 0);
        playlistLabels.addView(text("PLAYLIST", 10, Color.WHITE, true));
        playlistLabels.addView(text("Liked Songs", 21, Color.WHITE, true));
        playlistLabels.addView(text(favorites.size() + " liked · Sonora collection", 11,
                Color.rgb(232, 220, 244), false));
        likedPlaylist.addView(playlistLabels, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        likedPlaylist.setContentDescription("Liked Songs, " + favorites.size() + " tracks");
        likedPlaylist.setOnClickListener(view -> {
            libraryFilter = "Liked songs";
            showLibrary();
        });
        pageContent.addView(likedPlaylist);

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        Button playLibrary = button("▶", 0xffc66cff, 0xff25172f);
        playLibrary.setContentDescription("Play " + libraryFilter.toLowerCase(Locale.ROOT));
        playLibrary.setOnClickListener(view -> {
            List<Track> selected = getLibraryTracks();
            if (selected.isEmpty()) {
                showToast("Like a song to start your collection");
            } else {
                playTrack(tracks.indexOf(selected.get(0)));
            }
        });
        actions.addView(playLibrary, new LinearLayout.LayoutParams(dp(44), dp(44)));
        Button shuffleLibrary = button("⤨", SURFACE, ACCENT);
        shuffleLibrary.setContentDescription("Shuffle " + libraryFilter.toLowerCase(Locale.ROOT));
        LinearLayout.LayoutParams shuffleParams = new LinearLayout.LayoutParams(dp(44), dp(44));
        shuffleParams.setMargins(dp(10), 0, dp(12), 0);
        shuffleLibrary.setOnClickListener(view -> {
            List<Track> selected = getLibraryTracks();
            if (selected.isEmpty()) {
                showToast("Like a song to start your collection");
            } else {
                playTrack(tracks.indexOf(selected.get(random.nextInt(selected.size()))));
            }
        });
        actions.addView(shuffleLibrary, shuffleParams);
        actions.addView(text(getLibraryTracks().size() + " tracks", 12, MUTED, false));
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(56));
        actionsParams.setMargins(0, dp(6), 0, 0);
        pageContent.addView(actions, actionsParams);

        LinearLayout filters = new LinearLayout(this);
        filters.setPadding(0, dp(6), 0, dp(8));
        String[] names = {"All songs", "Liked songs"};
        for (String name : names) {
            Button chip = button("Liked songs".equals(name)
                            ? "♥ Liked songs (" + favorites.size() + ")" : name,
                    name.equals(libraryFilter) ? ACCENT : SURFACE,
                    name.equals(libraryFilter) ? Color.rgb(24, 43, 32) : Color.WHITE);
            chip.setTextSize(12);
            chip.setAllCaps(false);
            chip.setBackground(round(name.equals(libraryFilter) ? ACCENT : SURFACE,
                    dp(22), name.equals(libraryFilter) ? ACCENT : 0xff343936));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, dp(36));
            params.setMargins(0, 0, dp(8), 0);
            filters.addView(chip, params);
            chip.setOnClickListener(view -> {
                libraryFilter = name;
                showLibrary();
            });
        }
        pageContent.addView(filters);

        List<Track> visible = getLibraryTracks();
        heading(libraryFilter, visible.size() + " tracks");
        LinearLayout tableHeader = new LinearLayout(this);
        tableHeader.setGravity(Gravity.CENTER_VERTICAL);
        tableHeader.setPadding(dp(5), 0, dp(8), 0);
        TextView numberHeading = text("#", 10, MUTED, false);
        tableHeader.addView(numberHeading, new LinearLayout.LayoutParams(dp(28), dp(32)));
        tableHeader.addView(text("Title", 10, MUTED, false),
                new LinearLayout.LayoutParams(0, dp(32), 1));
        tableHeader.addView(text("Album", 10, MUTED, false),
                new LinearLayout.LayoutParams(dp(65), dp(32)));
        TextView durationHeading = text("◷", 10, MUTED, false);
        durationHeading.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        tableHeader.addView(durationHeading, new LinearLayout.LayoutParams(dp(38), dp(32)));
        pageContent.addView(tableHeader);
        View divider = new View(this);
        divider.setBackgroundColor(0x33ffffff);
        pageContent.addView(divider, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));
        if (visible.isEmpty()) {
            TextView empty = text("No liked songs yet.\nTap ♡ on a track to add it here.",
                    14, MUTED, false);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(dp(12), dp(28), dp(12), dp(28));
            pageContent.addView(empty);
        } else {
            for (int i = 0; i < visible.size(); i++) {
                addLibraryTrackRow(visible.get(i), i + 1);
            }
        }
    }

    private List<Track> getLibraryTracks() {
        if (!"Liked songs".equals(libraryFilter)) return tracks;
        java.util.ArrayList<Track> liked = new java.util.ArrayList<>();
        for (int index = 0; index < tracks.size(); index++) {
            if (favorites.contains(index)) liked.add(tracks.get(index));
        }
        return liked;
    }

    private void addLibraryTrackRow(Track track, int position) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(5), dp(6), dp(7), dp(6));
        TextView number = text(String.valueOf(position), 11, MUTED, false);
        number.setGravity(Gravity.CENTER);
        row.addView(number, new LinearLayout.LayoutParams(dp(28), dp(48)));
        TextView cover = text(track.art, 19, Color.WHITE, true);
        cover.setGravity(Gravity.CENTER);
        cover.setBackground(round(track.startColor, dp(6), track.endColor));
        row.addView(cover, new LinearLayout.LayoutParams(dp(42), dp(42)));
        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.setPadding(dp(9), 0, dp(4), 0);
        labels.addView(text(track.title, 12, Color.WHITE, true));
        labels.addView(text(track.artist + " · Original instrumental", 10, MUTED, false));
        row.addView(labels, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView album = text("Sonora Demos", 10, MUTED, false);
        album.setMaxLines(1);
        row.addView(album, new LinearLayout.LayoutParams(dp(58),
                ViewGroup.LayoutParams.WRAP_CONTENT));
        TextView duration = text(track.length, 10, MUTED, false);
        duration.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        row.addView(duration, new LinearLayout.LayoutParams(dp(38),
                ViewGroup.LayoutParams.MATCH_PARENT));
        row.setContentDescription(track.title + " by " + track.artist + ", " + track.length);
        row.setOnClickListener(view -> playTrack(tracks.indexOf(track)));
        pageContent.addView(row, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(58)));
    }

    private void showHome() {
        pageContent.addView(text("Good evening", 30, Color.WHITE, true));
        addHomeFilters();
        if ("Playlists".equals(homeFilter)) {
            heading("Your playlists", "1 mix");
            addPlaylistCard();
            return;
        }
        if ("All".equals(homeFilter)) {
            heading("Recently played", null);
            addRecentlyPlayedGrid();
        }
        heading("Made for you", "Sonora picks");
        addMadeForYouRail();
        heading("Your songs", tracks.size() + " tracks");
        addTrackList(tracks);
    }

    private void addHomeFilters() {
        LinearLayout filters = new LinearLayout(this);
        filters.setPadding(0, dp(14), 0, dp(8));
        String[] names = {"All", "Music", "Playlists"};
        for (String name : names) {
            Button chip = button(name, name.equals(homeFilter) ? ACCENT : SURFACE,
                    name.equals(homeFilter) ? Color.rgb(24, 43, 32) : Color.WHITE);
            chip.setTextSize(12);
            chip.setAllCaps(false);
            chip.setBackground(round(name.equals(homeFilter) ? ACCENT : SURFACE, dp(22),
                    name.equals(homeFilter) ? ACCENT : 0xff343936));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, dp(36));
            params.setMargins(0, 0, dp(8), 0);
            filters.addView(chip, params);
            chip.setOnClickListener(view -> {
                homeFilter = name;
                showHome();
            });
        }
        pageContent.addView(filters);
    }

    private void addRecentlyPlayedGrid() {
        for (int i = 0; i < tracks.size(); i += 2) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.addView(recentCard(tracks.get(i)), new LinearLayout.LayoutParams(0, dp(58), 1));
            if (i + 1 < tracks.size()) {
                LinearLayout.LayoutParams second = new LinearLayout.LayoutParams(0, dp(58), 1);
                second.setMargins(dp(8), 0, 0, 0);
                row.addView(recentCard(tracks.get(i + 1)), second);
            }
            LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, dp(58));
            rowParams.setMargins(0, 0, 0, dp(8));
            pageContent.addView(row, rowParams);
        }
    }

    private View recentCard(Track track) {
        LinearLayout card = new LinearLayout(this);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setBackground(round(0xff303431, dp(6), 0xff222623));
        TextView cover = text(track.art, 22, Color.WHITE, true);
        cover.setGravity(Gravity.CENTER);
        cover.setBackground(round(track.startColor, dp(6), track.endColor));
        card.addView(cover, new LinearLayout.LayoutParams(dp(58), dp(58)));
        TextView title = text(track.title, 12, Color.WHITE, true);
        title.setMaxLines(2);
        title.setPadding(dp(9), 0, dp(4), 0);
        card.addView(title);
        card.setContentDescription("Play " + track.title);
        card.setOnClickListener(view -> playTrack(tracks.indexOf(track)));
        return card;
    }

    private void addMadeForYouRail() {
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);
        LinearLayout rail = new LinearLayout(this);
        rail.setOrientation(LinearLayout.HORIZONTAL);
        for (Track track : tracks) {
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            TextView cover = text(track.art, 48, Color.WHITE, true);
            cover.setGravity(Gravity.CENTER);
            cover.setBackground(round(track.startColor, dp(8), track.endColor));
            card.addView(cover, new LinearLayout.LayoutParams(dp(132), dp(132)));
            TextView title = text(track.title, 13, Color.WHITE, true);
            title.setMaxLines(1);
            LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                    dp(132), ViewGroup.LayoutParams.WRAP_CONTENT);
            titleParams.setMargins(0, dp(8), 0, 0);
            card.addView(title, titleParams);
            TextView artist = text(track.artist + " · instrumental", 11, MUTED, false);
            artist.setMaxLines(1);
            card.addView(artist, new LinearLayout.LayoutParams(
                    dp(132), ViewGroup.LayoutParams.WRAP_CONTENT));
            card.setOnClickListener(view -> playTrack(tracks.indexOf(track)));
            LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                    dp(132), ViewGroup.LayoutParams.WRAP_CONTENT);
            cardParams.setMargins(0, 0, dp(12), 0);
            rail.addView(card, cardParams);
        }
        scroll.addView(rail);
        pageContent.addView(scroll);
    }

    private void addPlaylistCard() {
        LinearLayout card = new LinearLayout(this);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(10), dp(10), dp(12), dp(10));
        card.setBackground(round(SURFACE, dp(12), 0xff343936));
        TextView cover = text("☾", 26, Color.WHITE, true);
        cover.setGravity(Gravity.CENTER);
        cover.setBackground(round(0xff7555a8, dp(9), 0xff352649));
        card.addView(cover, new LinearLayout.LayoutParams(dp(60), dp(60)));
        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.setPadding(dp(12), 0, 0, 0);
        labels.addView(text("Soft Focus", 14, Color.WHITE, true));
        labels.addView(text("Sonora Session · 6 original tracks", 11, MUTED, false));
        card.addView(labels, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        card.addView(text("▶", 18, ACCENT, true));
        card.setOnClickListener(view -> playTrack(0));
        pageContent.addView(card);
    }

    private void showFullPlayer() {
        fullPlayerOpen = true;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(8), dp(20), dp(15));
        root.setBackground(new GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xff413746, BACKGROUND, 0xff121413}));

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        Button close = button("⌄", SURFACE, Color.WHITE);
        close.setContentDescription("Close now playing");
        close.setOnClickListener(view -> showApp());
        top.addView(close, new LinearLayout.LayoutParams(dp(44), dp(44)));
        TextView nowPlaying = text("NOW PLAYING", 11, MUTED, true);
        nowPlaying.setGravity(Gravity.CENTER);
        top.addView(nowPlaying, new LinearLayout.LayoutParams(0, dp(44), 1));
        Button more = button("•••", SURFACE, Color.WHITE);
        more.setContentDescription("More options");
        more.setOnClickListener(view -> showPlayerOptions(more));
        top.addView(more, new LinearLayout.LayoutParams(dp(44), dp(44)));
        root.addView(top);

        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(dp(2), dp(15), dp(2), dp(8));

        TextView artwork = text(currentTrack.art, 94, Color.WHITE, true);
        artwork.setGravity(Gravity.CENTER);
        artwork.setBackground(round(currentTrack.startColor, dp(16), currentTrack.endColor));
        artwork.setElevation(dp(14));
        LinearLayout.LayoutParams artworkParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(310));
        artworkParams.setMargins(0, 0, 0, dp(27));
        content.addView(artwork, artworkParams);

        GestureDetector swipeDetector = new GestureDetector(this,
                new GestureDetector.SimpleOnGestureListener() {
                    @Override public boolean onDown(MotionEvent event) { return true; }
                    @Override public boolean onFling(MotionEvent start, MotionEvent end,
                                                     float velocityX, float velocityY) {
                        float deltaX = end.getX() - start.getX();
                        float deltaY = end.getY() - start.getY();
                        if (Math.abs(deltaX) > dp(55)
                                && Math.abs(deltaX) > Math.abs(deltaY) * 1.25f
                                && Math.abs(velocityX) > dp(100)) {
                            playNext(deltaX < 0);
                            return true;
                        }
                        return false;
                    }
                });
        artwork.setOnTouchListener((view, event) -> swipeDetector.onTouchEvent(event));

        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout trackLabels = new LinearLayout(this);
        trackLabels.setOrientation(LinearLayout.VERTICAL);
        TextView title = text(currentTrack.title, 22, Color.WHITE, true);
        TextView artist = text(currentTrack.artist + " · original instrumental", 13, MUTED, false);
        trackLabels.addView(title);
        trackLabels.addView(artist);
        titleRow.addView(trackLabels, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button favorite = button(favorites.contains(tracks.indexOf(currentTrack)) ? "♥" : "♡",
                BACKGROUND, ACCENT);
        favorite.setTextSize(25);
        favorite.setContentDescription("Toggle favorite");
        favorite.setOnClickListener(view -> {
            int index = tracks.indexOf(currentTrack);
            if (!favorites.add(index)) favorites.remove(index);
            persistFavorites();
            favorite.setText(favorites.contains(index) ? "♥" : "♡");
            showFavoriteToast(index);
            if ("Library".equals(currentTab)) showLibrary();
        });
        titleRow.addView(favorite, new LinearLayout.LayoutParams(dp(48), dp(48)));
        content.addView(titleRow);

        SeekBar seek = new SeekBar(this);
        seek.setMax(mediaPlayer == null ? 24000 : mediaPlayer.getDuration());
        seek.setProgress(mediaPlayer == null ? 0 : mediaPlayer.getCurrentPosition());
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int value, boolean fromUser) {
                if (fromUser && mediaPlayer != null) mediaPlayer.seekTo(value);
            }
            @Override public void onStartTrackingTouch(SeekBar bar) { }
            @Override public void onStopTrackingTouch(SeekBar bar) { }
        });
        content.addView(seek, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(32)));
        progressBar = seek;

        LinearLayout controls = new LinearLayout(this);
        controls.setGravity(Gravity.CENTER);
        Button shuffle = button(shuffleOn ? "⤨" : "⤨", BACKGROUND,
                shuffleOn ? ACCENT : MUTED);
        shuffle.setContentDescription("Toggle shuffle");
        shuffle.setOnClickListener(view -> {
            shuffleOn = !shuffleOn;
            shuffle.setTextColor(shuffleOn ? ACCENT : MUTED);
        });
        controls.addView(shuffle, new LinearLayout.LayoutParams(0, dp(54), 1));
        Button previous = button("|◀", BACKGROUND, Color.WHITE);
        previous.setContentDescription("Previous track");
        previous.setOnClickListener(view -> playNext(false));
        controls.addView(previous, new LinearLayout.LayoutParams(0, dp(54), 1));
        Button play = button(playing ? "Ⅱ" : "▶", Color.rgb(238, 229, 255),
                Color.rgb(35, 29, 47));
        play.setContentDescription(playing ? "Pause" : "Play");
        play.setOnClickListener(view -> {
            togglePlayback();
            play.setText(playing ? "Ⅱ" : "▶");
            play.setContentDescription(playing ? "Pause" : "Play");
        });
        controls.addView(play, new LinearLayout.LayoutParams(dp(58), dp(58)));
        Button next = button("▶|", BACKGROUND, Color.WHITE);
        next.setContentDescription("Next track");
        next.setOnClickListener(view -> playNext(true));
        controls.addView(next, new LinearLayout.LayoutParams(0, dp(54), 1));
        Button repeat = button(repeatOne ? "↻¹" : "↻", BACKGROUND,
                repeatOne ? ACCENT : MUTED);
        repeat.setContentDescription("Toggle repeat one");
        repeat.setOnClickListener(view -> {
            repeatOne = !repeatOne;
            repeat.setText(repeatOne ? "↻¹" : "↻");
            repeat.setTextColor(repeatOne ? ACCENT : MUTED);
        });
        controls.addView(repeat, new LinearLayout.LayoutParams(0, dp(54), 1));
        content.addView(controls);

        LinearLayout extra = new LinearLayout(this);
        extra.setGravity(Gravity.CENTER);
        Button queueButton = button("☷  Up next", BACKGROUND, ACCENT);
        Button shareButton = button("↗  Share", BACKGROUND, ACCENT);
        queueButton.setOnClickListener(view -> showQueue(content));
        Button lyricsButton = button("♫  Lyrics", BACKGROUND, ACCENT);
        lyricsButton.setContentDescription("Show lyrics and track details");
        lyricsButton.setOnClickListener(view -> showLyrics());
        shareButton.setOnClickListener(view -> shareCurrentTrack());
        extra.addView(queueButton, new LinearLayout.LayoutParams(0, dp(46), 1));
        extra.addView(lyricsButton, new LinearLayout.LayoutParams(0, dp(46), 1));
        extra.addView(shareButton, new LinearLayout.LayoutParams(0, dp(46), 1));
        content.addView(extra);

        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        lyricsViewOpen = false;
        if (trackChangeDirection != 0) {
            artwork.setTranslationX(dp(trackChangeDirection * 36));
            artwork.setAlpha(0.55f);
            artwork.animate().translationX(0).alpha(1f).setDuration(220).start();
            trackChangeDirection = 0;
        }
    }

    private void showLyrics() {
        lyricsViewOpen = true;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(8), dp(20), dp(12));
        root.setBackground(new GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xff382b45, BACKGROUND, 0xff121413}));

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        Button close = button("⌄", SURFACE, Color.WHITE);
        close.setContentDescription("Back to player");
        close.setOnClickListener(view -> showFullPlayer());
        top.addView(close, new LinearLayout.LayoutParams(dp(44), dp(44)));
        TextView title = text("LYRICS", 11, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        title.setLetterSpacing(0.16f);
        top.addView(title, new LinearLayout.LayoutParams(0, dp(44), 1));
        top.addView(new View(this), new LinearLayout.LayoutParams(dp(44), dp(44)));
        root.addView(top);

        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_VERTICAL);
        content.setPadding(dp(4), dp(28), dp(4), dp(24));

        TextView note = text("♪  ORIGINAL INSTRUMENTAL", 12, MUTED, true);
        note.setLetterSpacing(0.08f);
        content.addView(note);
        TextView instrumental = text("♪  Instrumental  ♪", 25, MUTED, true);
        LinearLayout.LayoutParams instrumentalParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        instrumentalParams.setMargins(0, dp(22), 0, dp(18));
        content.addView(instrumental, instrumentalParams);
        TextView lyricLine = text("No sung lyrics available", 30, Color.WHITE, true);
        lyricLine.setMaxLines(3);
        LinearLayout.LayoutParams lyricLineParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lyricLineParams.setMargins(0, 0, 0, dp(12));
        content.addView(lyricLine, lyricLineParams);
        content.addView(text("This original demo contains no vocals or lyrics.",
                13, MUTED, false));

        LinearLayout details = new LinearLayout(this);
        details.setGravity(Gravity.CENTER_VERTICAL);
        details.setPadding(dp(12), dp(12), dp(12), dp(12));
        details.setBackground(round(SURFACE, dp(12), 0xff34303c));
        TextView cover = text(currentTrack.art, 24, Color.WHITE, true);
        cover.setGravity(Gravity.CENTER);
        cover.setBackground(round(currentTrack.startColor, dp(8), currentTrack.endColor));
        details.addView(cover, new LinearLayout.LayoutParams(dp(58), dp(58)));
        LinearLayout metadata = new LinearLayout(this);
        metadata.setOrientation(LinearLayout.VERTICAL);
        metadata.setPadding(dp(12), 0, 0, 0);
        metadata.addView(text(currentTrack.title, 14, Color.WHITE, true));
        metadata.addView(text(currentTrack.artist + " · Sonora demo", 11, MUTED, false));
        details.addView(metadata);
        LinearLayout.LayoutParams detailsParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        detailsParams.setMargins(0, dp(28), 0, 0);
        content.addView(details, detailsParams);

        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        root.addView(createPlayer(), new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(78)));
        setContentView(root);
    }

    private void attachPlayerGesture(View target) {
        GestureDetector detector = new GestureDetector(this,
                new GestureDetector.SimpleOnGestureListener() {
                    @Override public boolean onDown(MotionEvent event) { return true; }
                    @Override public boolean onSingleTapUp(MotionEvent event) {
                        showFullPlayer();
                        return true;
                    }
                    @Override public boolean onFling(MotionEvent start, MotionEvent end,
                                                     float velocityX, float velocityY) {
                        float deltaX = end.getX() - start.getX();
                        float deltaY = end.getY() - start.getY();
                        if (Math.abs(deltaX) > dp(45)
                                && Math.abs(deltaX) > Math.abs(deltaY) * 1.25f
                                && Math.abs(velocityX) > dp(100)) {
                            playNext(deltaX < 0);
                            return true;
                        }
                        return false;
                    }
                });
        target.setOnTouchListener((view, event) -> detector.onTouchEvent(event));
    }

    private void playNext(boolean forward) {
        int nextIndex;
        if (shuffleOn && tracks.size() > 1) {
            do {
                nextIndex = random.nextInt(tracks.size());
            } while (nextIndex == tracks.indexOf(currentTrack));
        } else {
            int direction = forward ? 1 : -1;
            nextIndex = tracks.indexOf(currentTrack) + direction;
        }
        playTrack(nextIndex, forward ? 1 : -1);
    }

    private void showQueue(LinearLayout content) {
        View extras = content.getChildAt(content.getChildCount() - 1);
        if (extras != null) content.removeView(extras);
        TextView queueHeading = text("Up next", 17, Color.WHITE, true);
        queueHeading.setPadding(0, dp(18), 0, dp(8));
        content.addView(queueHeading);
        for (int offset = 1; offset < tracks.size(); offset++) {
            Track queued = tracks.get((tracks.indexOf(currentTrack) + offset) % tracks.size());
            addTrackRow(content, queued, false);
        }
    }

    private void showPlayerOptions(View anchor) {
        android.widget.PopupMenu menu = new android.widget.PopupMenu(this, anchor);
        menu.getMenu().add(favorites.contains(tracks.indexOf(currentTrack))
                ? "Remove from favorites" : "Add to favorites").setOnMenuItemClickListener(item -> {
            int index = tracks.indexOf(currentTrack);
            if (!favorites.add(index)) favorites.remove(index);
            persistFavorites();
            showFavoriteToast(index);
            return true;
        });
        menu.getMenu().add("Share track").setOnMenuItemClickListener(item -> {
            shareCurrentTrack();
            return true;
        });
        menu.show();
    }

    private void showFavoriteToast(int index) {
        showToast(favorites.contains(index) ? "Added to favorites" : "Removed from favorites");
    }

    private void showToast(String message) {
        android.widget.Toast.makeText(this, message, android.widget.Toast.LENGTH_SHORT).show();
    }

    private void persistFavorites() {
        Set<String> saved = new HashSet<>();
        for (int index : favorites) saved.add(String.valueOf(index));
        getSharedPreferences("sonora", MODE_PRIVATE).edit()
                .putStringSet("favorites", saved).apply();
    }

    private void shareCurrentTrack() {
        android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_SEND);
        intent.setType("text/plain");
        intent.putExtra(android.content.Intent.EXTRA_TEXT,
                currentTrack.title + " — " + currentTrack.artist);
        startActivity(android.content.Intent.createChooser(intent, "Share track"));
    }

    private void showSearch() {
        pageContent.addView(text("Find a new favorite", 14, MUTED, false));
        pageContent.addView(text("Search", 30, Color.WHITE, true));

        EditText search = new EditText(this);
        search.setSingleLine(true);
        search.setTextColor(Color.WHITE);
        search.setHintTextColor(MUTED);
        search.setHint("Songs or artists");
        search.setTextSize(15);
        search.setPadding(dp(14), 0, dp(14), 0);
        search.setBackground(round(SURFACE, dp(13), 0xff393642));
        LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        searchParams.setMargins(0, dp(18), 0, dp(10));
        pageContent.addView(search, searchParams);

        LinearLayout results = new LinearLayout(this);
        results.setOrientation(LinearLayout.VERTICAL);
        heading("All original demos", null);
        pageContent.addView(results);
        populateResults(results, "");
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                populateResults(results, s.toString());
            }
            @Override public void afterTextChanged(Editable s) { }
        });
    }

    private void populateResults(LinearLayout container, String query) {
        container.removeAllViews();
        String normalized = query.toLowerCase(Locale.ROOT).trim();
        int matches = 0;
        for (Track track : tracks) {
            String searchable = (track.title + " " + track.artist).toLowerCase(Locale.ROOT);
            if (searchable.contains(normalized)) {
                addTrackRow(container, track, false);
                matches++;
            }
        }
        if (matches == 0) {
            container.addView(text("No matches found. Try a song or artist.", 14, MUTED, false));
        }
    }

    private void heading(String title, String detail) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(22), 0, dp(11));
        TextView titleView = text(title, 17, Color.WHITE, true);
        row.addView(titleView, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        if (detail != null) row.addView(text(detail, 12, MUTED, false));
        pageContent.addView(row);
    }

    private void addTrackList(List<Track> items) {
        for (Track track : items) addTrackRow(pageContent, track, false);
    }

    private void addTrackRow(Track track, boolean compact) {
        addTrackRow(pageContent, track, compact);
    }

    private void addTrackRow(LinearLayout container, Track track, boolean compact) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(5), dp(7), dp(7), dp(7));
        TextView cover = text(track.art, 20, Color.WHITE, true);
        cover.setGravity(Gravity.CENTER);
        cover.setBackground(round(track.startColor, dp(11), track.endColor));
        row.addView(cover, new LinearLayout.LayoutParams(dp(48), dp(48)));

        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.setPadding(dp(11), 0, dp(5), 0);
        labels.addView(text(track.title, 14, Color.WHITE, true));
        labels.addView(text(track.artist + " · Original instrumental", 11, MUTED, false));
        row.addView(labels, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        if (!compact) row.addView(text(track.length, 12, MUTED, false));

        row.setContentDescription(track.title + " by " + track.artist);
        row.setOnClickListener(view -> {
            playTrack(tracks.indexOf(track));
        });
        container.addView(row, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(62)));
    }

    private void updatePlayer() {
        playerTitle.setText(currentTrack.title);
        playerArtist.setText(currentTrack.artist);
        playerCover.setText(currentTrack.art);
        playerCover.setBackground(round(currentTrack.startColor, dp(12), currentTrack.endColor));
        if (trackChangeDirection != 0) {
            playerCover.animate().cancel();
            playerCover.setTranslationX(dp(trackChangeDirection * 14));
            playerCover.setAlpha(0.55f);
            playerCover.animate().translationX(0).alpha(1f).setDuration(180).start();
        }
        playButton.setText(playing ? "Ⅱ" : "▶");
        playButton.setContentDescription(playing ? "Pause" : "Play");
    }

    private void playTrack(int index) {
        playTrack(index, 0);
    }

    private void playTrack(int index, int direction) {
        int nextIndex = (index + tracks.size()) % tracks.size();
        currentTrack = tracks.get(nextIndex);
        trackChangeDirection = direction;
        releasePlayer();
        mediaPlayer = MediaPlayer.create(this, currentTrack.audioResource);
        if (mediaPlayer == null) {
            playing = false;
            updatePlayer();
            throw new IllegalStateException("Unable to load audio for " + currentTrack.title);
        }
        mediaPlayer.setOnCompletionListener(player -> {
            if (repeatOne) {
                player.seekTo(0);
                player.start();
            } else {
                playNext(true);
            }
        });
        progressBar.setProgress(0);
        playing = true;
        updatePlayer();
        mediaPlayer.start();
        progressHandler.post(progressUpdater);
        if (fullPlayerOpen) showFullPlayer();
    }

    private void togglePlayback() {
        if (mediaPlayer == null) {
            playTrack(tracks.indexOf(currentTrack));
        } else if (mediaPlayer.isPlaying()) {
            mediaPlayer.pause();
            playing = false;
            progressHandler.removeCallbacks(progressUpdater);
            updatePlayer();
        } else {
            mediaPlayer.start();
            playing = true;
            progressHandler.post(progressUpdater);
            updatePlayer();
        }
    }

    private void releasePlayer() {
        progressHandler.removeCallbacks(progressUpdater);
        if (mediaPlayer != null) {
            mediaPlayer.release();
            mediaPlayer = null;
        }
    }

    @Override
    protected void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (lyricsViewOpen) {
            showFullPlayer();
        } else if (fullPlayerOpen) {
            showApp();
        } else {
            super.onBackPressed();
        }
    }

    private TextView text(String value, int sizeSp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sizeSp);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private Button button(String value, int background, int foreground) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextSize(17);
        button.setTextColor(foreground);
        button.setPadding(0, 0, 0, 0);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setBackground(round(background, dp(24), background));
        return button;
    }

    private GradientDrawable round(int startColor, int radius, int endColor) {
        GradientDrawable shape = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR, new int[]{startColor, endColor});
        shape.setCornerRadius(radius);
        shape.setStroke(dp(1), 0x335f536b);
        return shape;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static final class Track {
        final String title;
        final String artist;
        final String length;
        final String art;
        final int startColor;
        final int endColor;
        final int audioResource;

        Track(String title, String artist, String length, String art, int startColor, int endColor,
              int audioResource) {
            this.title = title;
            this.artist = artist;
            this.length = length;
            this.art = art;
            this.startColor = startColor;
            this.endColor = endColor;
            this.audioResource = audioResource;
        }
    }
}
