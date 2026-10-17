import { App } from "./app";
import { aboutScreen } from "./screens/about";
import { arcadeScreen } from "./screens/arcade";
import { arcadeGameScreen } from "./screens/arcadeGame";
import { cardScreen } from "./screens/card";
import { challengeNewScreen, challengeScreen } from "./screens/challenge";
import { collectionScreen } from "./screens/collection";
import { courseRoundScreen, courseScreen } from "./screens/course";
import { dailyScreen } from "./screens/daily";
import { passagesScreen } from "./screens/passages";
import { practiceScreen } from "./screens/practice";
import { progressScreen } from "./screens/progress";
import { raceScreen } from "./screens/race";
import { replayScreen } from "./screens/replay";
import { replaysScreen } from "./screens/replays";
import { resultsScreen } from "./screens/results";
import { sessionScreen } from "./screens/session";
import { settingsScreen } from "./screens/settings";
import { shortcutsScreen } from "./screens/shortcuts";
import { wordsScreen } from "./screens/words";
import { goalScreen, loadProblemScreen, welcomeScreen } from "./screens/setup";
import { trophiesScreen } from "./screens/trophies";
import { checkAchievementsAtLaunch } from "./achievements";
import { challengeInHash } from "./challenge";
import { syncUpdateBanner } from "./components/updateBanner";
import { onPwaChange, registerServiceWorker } from "./pwa";
import { armSound } from "./sound";
import "./styles.css";
import "./themes.css";

const root = document.getElementById("app")!;
const app = new App(root);
app.register("welcome", welcomeScreen);
app.register("load-problem", loadProblemScreen);
app.register("calibration", practiceScreen);
app.register("goal", goalScreen);
app.register("practice", practiceScreen);
app.register("results", resultsScreen);
app.register("settings", settingsScreen);
app.register("about", aboutScreen);
app.register("shortcuts", shortcutsScreen);
app.register("progress", progressScreen);
app.register("session", sessionScreen);
app.register("arcade", arcadeScreen);
app.register("arcade-game", arcadeGameScreen);
app.register("race", raceScreen);
app.register("collection", collectionScreen);
app.register("replays", replaysScreen);
app.register("replay", replayScreen);
app.register("daily", dailyScreen);
app.register("card", cardScreen);
app.register("words", wordsScreen);
app.register("passages", passagesScreen);
app.register("trophies", trophiesScreen);
app.register("course", courseScreen);
app.register("course-round", courseRoundScreen);
app.register("challenge", challengeScreen);
app.register("challenge-new", challengeNewScreen);
armSound();
app.onNavigate = (screen) => syncUpdateBanner(screen);
onPwaChange(() => syncUpdateBanner(app.screen));
registerServiceWorker();
if (!app.loadProblem) {
  const already = checkAchievementsAtLaunch(app);
  if (already > 0 && !app.needsSetup) {
    app.notice = `Badges are here! You'd already earned ${already === 1 ? "one" : already}. See ${already === 1 ? "it" : "them"} in the trophy case, in the menu.`;
  }
}

/** Opens a challenge link (the part after #c=), taking it out of the address so a reload doesn't restart the race. */
function openLinkedChallenge(): boolean {
  const linked = challengeInHash(location.hash);
  if (!linked) return false;
  history.replaceState(null, "", location.pathname + location.search);
  if (app.loadProblem) app.home();
  else app.go({ name: "challenge", ...linked });
  return true;
}
window.addEventListener("hashchange", () => openLinkedChallenge());
if (!openLinkedChallenge()) app.home();
