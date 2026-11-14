const onBlur = (event) => {
  event.target.dispatchEvent(new Event("change", { bubbles: true }));
};

const onChange = (event) => {
  event.target.removeEventListener("blur", onBlur);
};

const ScrollToEditNumbers = () => {
  Hooks.once("ready", () => {
    document.addEventListener(
      "wheel",
      (event) => {
        const active = document.activeElement;
        if (
          active &&
          active.matches('input[type="number"], input[data-dtype="Number"]') &&
          active === event.target &&
          !active.disabled &&
          !active.readOnly
        ) {
          event.preventDefault();
          if (
            !game.settings.get(game.system.id, "scrollToEditNumbers") ||
            event.deltaY === 0
          ) {
            return;
          }

          if (active.type === "number") {
            if (event.deltaY < 0) active.stepUp();
            else active.stepDown();
          } else {
            const current = Number.parseInt(active.value, 10) || 0;
            active.value = String(current + (event.deltaY < 0 ? 1 : -1));
          }

          active.addEventListener("blur", onBlur, { once: true });
          active.addEventListener("change", onChange, { once: true });
        }
      },
      { passive: false },
    );
  });
};

export default ScrollToEditNumbers;
