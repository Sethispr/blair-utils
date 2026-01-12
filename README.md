<style>
  /* blair top.gg description styles*/
  /* sora x inter is good too */
  @import url("https://fonts.googleapis.com/css2?family=Lexend+Deca:wght@300;400;600&display=swap");

  /**
   * @section theme configs
   * using cattpuccin mauve same as blair
   */
  :root {
    --ctp-base: #1e1e2e;
    --ctp-surface: #313244;
    --ctp-text: #cdd6f4;
    --ctp-subtext: #a6adc8;
    --ctp-mauve: #cba6f7;
    --ctp-mauve-alpha: rgba(203, 166, 247, 0.1);

    --font-family: "Lexend Deca", sans-serif;
    --pad-container: 15px;
    --pad-quote: 8px 12px;
    --br-container: 8px;
    --br-pill: 50px;
  }

  /* simple fade up for load */
  @keyframes blair-load {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  ::selection {
    background: var(--ctp-mauve-alpha);
    color: var(--ctp-mauve);
  }

  /**
   * @block blair-container
   * main content wrapper
   * added animation for page load
   */
  .blair-container {
    background-color: var(--ctp-base);
    color: var(--ctp-text);
    font-family: var(--font-family);
    line-height: 1.5;
    padding: var(--pad-container);
    border-radius: var(--br-container);
    -webkit-font-smoothing: antialiased;
    animation: blair-load 0.5s ease-out forwards;
  }

  /* stagger effect for content */
  .blair-container > * {
    animation: blair-load 0.5s ease-out both;
  }

  .blair-container__image:nth-child(1) { animation-delay: 0.1s; }
  .blair-container__header { animation-delay: 0.2s; }
  .blair-container blockquote { animation-delay: 0.3s; }

  .blair-container__header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 15px;
  }

  .blair-container__header-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .blair-container__image {
    max-width: 100%;
    height: auto;
    display: block;
    margin-bottom: 9px;
  }

  .blair-container__badge {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    background-color: #cba6f7;
    border-radius: 50px !important;
    padding: 1px;
    overflow: hidden;
    text-decoration: none;
    height: 26px;
    margin-bottom: 4px;
  }

  .blair-container__badge img {
    display: block;
    height: 24px !important;
    border-radius: 50px !important;
    pointer-events: none;
  }

  /**
   * @element blair-container__quote
   * block quote (> styling)
   */
  .blair-container blockquote {
    position: relative;
    margin: 20px 0 !important;
    padding: var(--pad-quote) !important;
    background: linear-gradient(to right, var(--ctp-mauve-alpha), transparent) !important;
    border: 1px solid var(--ctp-mauve-border) !important;
    border-left: 4px solid var(--ctp-mauve) !important;
    border-radius: 4px 12px 12px 4px;
    color: var(--ctp-subtext);
    font-size: 0.92em;
    font-style: normal;
    box-shadow: 4px 4px 15px rgba(0, 0, 0, 0.1);
  }

  .blair-container blockquote::before {
    content: "NOTE";
    display: block;
    font-weight: 600;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    color: var(--ctp-mauve);
    margin-bottom: 4px;
    opacity: 0.8;
  }

  .blair-container code {
    color: var(--ctp-mauve) !important;
    background-color: var(--ctp-surface);
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 0.9em;
  }

  .blair-container a {
    color: var(--ctp-mauve) !important;
    text-decoration: none;
    font-weight: 600;
  }

  .blair-container hr {
    border: 0;
    height: 1px;
    background: var(--ctp-surface);
    margin: var(--mg-hr);
  }
</style>

<div class="blair-container"><img
    src="https://raw.githubusercontent.com/Sethispr/blair/main/src/assets/IMG_7148.png"
    alt="blair cards preview banner"
    class="blair-container__image"
  /><div class="blair-container__header">
    <div class="blair-container__header-item">
      <span
        ><strong>Official Discord/Support Server: </strong><a href="https://discord.com/invite/aGZay2PhDp">Join Here!</a></span
      >
      <a href="https://discord.com/invite/aGZay2PhDp" class="blair-container__badge">
        <img
          src="https://img.shields.io/badge/Discord-cba6f7?style=for-the-badge&logo=discord&logoColor=11111b"
          height="24"
        />
      </a>
    </div>
    <div class="blair-container__header-item">
      <span><strong>Commands:</strong> Use <strong><code>bhelp</code></strong> or <strong><code>/help</code></strong> for command info.</span>
      <a href="https://sethispr.github.io/blair/" class="blair-container__badge">
        <img
          src="https://img.shields.io/badge/github%20pages-cba6f7?style=for-the-badge&logo=github&logoColor=11111b"
          height="24"
        />
      </a>
    </div>
  </div><blockquote>Blair is in a <strong>very early</strong> stage of testing!</blockquote><img
    src="https://raw.githubusercontent.com/Sethispr/blair/ba250232d3436bea8c0fd0f8057beb71456e1347/src/assets/IMG_5581.png"
    alt="seth profile card preview 1"
    class="blair-container__image"
  /><br><img
    src="https://raw.githubusercontent.com/Sethispr/blair/main/src/assets/IMG_5582.png"
    alt="mawii profile card preview 2"
    class="blair-container__image"
  />
</div>
