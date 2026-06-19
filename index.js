(function(exports, metro, common, lazy, api, plugin) {
  "use strict";

  const React = common.React;
  const RN = common.ReactNative;
  const storage = plugin.storage;

  storage.enabled ??= false;
  storage.displayName ??= "Badge Collector";
  storage.username ??= "badgecollector";
  storage.badgesEnabled ??= true;
  storage.nitroEnabled ??= true;

  // Everything useful except Discord Staff and Partner.
  // STAFF = 1 and PARTNER = 2 are intentionally not used.
  const FLAGS = {
    HYPESQUAD: 4,
    BUG_HUNTER_1: 8,
    BRAVERY: 64,
    BRILLIANCE: 128,
    BALANCE: 256,
    EARLY_SUPPORTER: 512,
    BUG_HUNTER_2: 16384,
    VERIFIED_DEVELOPER: 131072,
    MOD_ALUMNI: 262144,
    ACTIVE_DEVELOPER: 4194304
  };

  const ALL_FLAGS_NO_STAFF_PARTNER =
    FLAGS.HYPESQUAD |
    FLAGS.BUG_HUNTER_1 |
    FLAGS.BRAVERY |
    FLAGS.BRILLIANCE |
    FLAGS.BALANCE |
    FLAGS.EARLY_SUPPORTER |
    FLAGS.BUG_HUNTER_2 |
    FLAGS.VERIFIED_DEVELOPER |
    FLAGS.MOD_ALUMNI |
    FLAGS.ACTIVE_DEVELOPER;

  let unpatches = [];
  let myId = null;

  function safeFindStore(name) {
    try {
      return metro.findByStoreName?.(name) || metro.findByStoreNameLazy?.(name);
    } catch {
      return null;
    }
  }

  function withBadges(value) {
    const n = Number(value || 0);
    return storage.badgesEnabled ? (n | ALL_FLAGS_NO_STAFF_PARTNER) : n;
  }

  function oldDate(months) {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d;
  }

  function applyProfileProps(obj, original) {
    if (!obj || !storage.enabled) return obj;

    const fakeDisplay = storage.displayName || original?.globalName || original?.displayName || original?.username || "Badge Collector";
    const fakeUsername = storage.username || original?.username || "badgecollector";

    try { obj.username = fakeUsername; } catch {}
    try { obj.globalName = fakeDisplay; } catch {}
    try { obj.displayName = fakeDisplay; } catch {}
    try { obj.publicFlags = withBadges(original?.publicFlags ?? obj.publicFlags); } catch {}
    try { obj.flags = withBadges(original?.flags ?? obj.flags); } catch {}

    if (storage.nitroEnabled) {
      try { obj.premiumType = 2; } catch {}
      try { obj.premiumSince = oldDate(72); } catch {}
      try { obj.premiumGuildSince = oldDate(24); } catch {}
    }

    try {
      Object.defineProperty(obj, "username", { get: () => fakeUsername, configurable: true });
      Object.defineProperty(obj, "globalName", { get: () => fakeDisplay, configurable: true });
      Object.defineProperty(obj, "displayName", { get: () => fakeDisplay, configurable: true });
      Object.defineProperty(obj, "publicFlags", { get: () => withBadges(original?.publicFlags), configurable: true });
      Object.defineProperty(obj, "flags", { get: () => withBadges(original?.flags), configurable: true });

      if (storage.nitroEnabled) {
        Object.defineProperty(obj, "premiumType", { get: () => 2, configurable: true });
        Object.defineProperty(obj, "premiumSince", { get: () => oldDate(72), configurable: true });
        Object.defineProperty(obj, "premiumGuildSince", { get: () => oldDate(24), configurable: true });
      }
    } catch {}

    try {
      obj.hasFlag = flag => !!(withBadges(original?.publicFlags || original?.flags || 0) & flag);
    } catch {}

    return obj;
  }

  function cloneObject(original) {
    if (!original || !storage.enabled) return original;

    try {
      const clone = Object.create(Object.getPrototypeOf(original));
      for (const key of Reflect.ownKeys(original)) {
        try {
          const desc = Object.getOwnPropertyDescriptor(original, key);
          if (desc) Object.defineProperty(clone, key, desc);
        } catch {}
      }
      return applyProfileProps(clone, original);
    } catch {
      return applyProfileProps({ ...original }, original);
    }
  }

  function cloneUser(user) {
    if (!user || !storage.enabled) return user;
    try {
      if (myId && user.id !== myId) return user;
    } catch {}
    return cloneObject(user);
  }

  function cloneProfile(profile, userId) {
    if (!profile || !storage.enabled) return profile;
    try {
      if (myId && userId && userId !== myId) return profile;
    } catch {}
    return cloneObject(profile);
  }

  function patchStores() {
    const UserStore = safeFindStore("UserStore") || metro.findByProps?.("getCurrentUser", "getUser");

    if (UserStore) {
      try {
        const realCurrent = UserStore.getCurrentUser?.();
        if (realCurrent?.id) myId = realCurrent.id;
      } catch {}

      try {
        if (UserStore.getCurrentUser) {
          unpatches.push(api.patcher.instead("getCurrentUser", UserStore, (args, orig) => {
            return cloneUser(orig(...args));
          }));
        }

        if (UserStore.getUser) {
          unpatches.push(api.patcher.instead("getUser", UserStore, (args, orig) => {
            const user = orig(...args);
            return cloneUser(user);
          }));
        }
      } catch {}
    }

    const UserProfileStore =
      safeFindStore("UserProfileStore") ||
      metro.findByProps?.("getUserProfile", "getGuildMemberProfile");

    if (UserProfileStore) {
      try {
        if (UserProfileStore.getUserProfile) {
          unpatches.push(api.patcher.instead("getUserProfile", UserProfileStore, (args, orig) => {
            const profile = orig(...args);
            return cloneProfile(profile, args?.[0]);
          }));
        }

        if (UserProfileStore.getGuildMemberProfile) {
          unpatches.push(api.patcher.instead("getGuildMemberProfile", UserProfileStore, (args, orig) => {
            const profile = orig(...args);
            return cloneProfile(profile, args?.[0]);
          }));
        }
      } catch {}
    }
  }

  function forceUpdateDiscord() {
    try {
      const UserStore = safeFindStore("UserStore") || metro.findByProps?.("getCurrentUser", "getUser");
      UserStore?.emitChange?.();
    } catch {}

    try {
      const UserProfileStore = safeFindStore("UserProfileStore") || metro.findByProps?.("getUserProfile", "getGuildMemberProfile");
      UserProfileStore?.emitChange?.();
    } catch {}

    try {
      const Dispatcher = metro.findByProps?.("dispatch", "subscribe");
      Dispatcher?.dispatch?.({ type: "USER_UPDATE", user: {} });
      Dispatcher?.dispatch?.({ type: "USER_PROFILE_UPDATE", userId: myId });
      Dispatcher?.dispatch?.({ type: "CURRENT_USER_UPDATE" });
    } catch {}
  }

  function Settings() {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

    let comps = {};
    try {
      comps = metro.findByProps("Button", "IconButton", "TableRow") || {};
    } catch {}

    const TableRowGroup = comps.TableRowGroup;
    const TableSwitchRow = comps.TableSwitchRow;
    const TextInput = comps.TextInput;

    const set = (key, value) => {
      storage[key] = value;
      forceUpdate();
      forceUpdateDiscord();
    };

    const inputField = (label, key, placeholder) => {
      return React.createElement(RN.View, { style: { marginBottom: 16 } },
        React.createElement(RN.Text, {
          style: { color: "#fff", fontSize: 14, fontWeight: "700", marginBottom: 8 }
        }, label),
        TextInput
          ? React.createElement(TextInput, {
              value: storage[key] || "",
              placeholder,
              onChangeText: v => set(key, v)
            })
          : React.createElement(RN.TextInput, {
              value: storage[key] || "",
              placeholder,
              placeholderTextColor: "#777",
              onChangeText: v => set(key, v),
              style: {
                color: "#fff",
                backgroundColor: "#1f1f1f",
                padding: 12,
                borderRadius: 8
              }
            })
      );
    };

    const switchRow = (label, subLabel, key) => {
      if (TableRowGroup && TableSwitchRow) {
        return React.createElement(TableRowGroup, { key, title: label },
          React.createElement(TableSwitchRow, {
            label,
            subLabel,
            value: !!storage[key],
            onValueChange: v => set(key, v)
          })
        );
      }

      return React.createElement(RN.Pressable, {
        key,
        onPress: () => set(key, !storage[key]),
        style: {
          backgroundColor: storage[key] ? "#2f7d46" : "#2b2b2b",
          padding: 14,
          borderRadius: 10,
          marginBottom: 16
        }
      },
        React.createElement(RN.Text, {
          style: { color: "#fff", fontSize: 16, fontWeight: "800" }
        }, storage[key] ? `${label}: ON` : `${label}: OFF`),
        React.createElement(RN.Text, {
          style: { color: "#aaa", marginTop: 4 }
        }, subLabel)
      );
    };

    return React.createElement(RN.ScrollView, {
      style: { flex: 1 },
      contentContainerStyle: { padding: 16 }
    },
      switchRow("Enabled", "Local-only changes on your device", "enabled"),
      switchRow("Badges", "All collector badges except Staff and Partner", "badgesEnabled"),
      switchRow("Nitro / Boost", "Local Nitro + boost dates", "nitroEnabled"),
      inputField("Display name", "displayName", "Badge Collector"),
      inputField("Username", "username", "badgecollector"),
      React.createElement(RN.Text, {
        style: { color: "#aaa", marginTop: 8, lineHeight: 18 }
      }, "Restart Discord after enabling if badges/name do not refresh instantly. This is local-only.")
    );
  }

  const index = {
    onLoad() {
      patchStores();
      forceUpdateDiscord();
    },

    onUnload() {
      for (const unpatch of unpatches) {
        try { unpatch?.(); } catch {}
      }
      unpatches = [];
      forceUpdateDiscord();
    },

    settings: Settings
  };

  exports.default = index;
  Object.defineProperty(exports, "__esModule", { value: true });
  return exports;
})({}, bunny.metro, bunny.metro.common, bunny.utils.lazy, bunny.api, vendetta.plugin);
