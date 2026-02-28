import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import TopPage from "./pages/TopPage";
import Home from "./pages/Home";
import GachaPage from "./pages/GachaPage";
import TeamBuilderPage from "./pages/TeamBuilderPage";


function Router() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Switch>
        <Route path={"/"} component={TopPage} />
        <Route path={"/match"} component={Home} />
        <Route path={"/gacha"} component={GachaPage} />
        <Route path={"/team-builder"} component={TeamBuilderPage} />
        <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
