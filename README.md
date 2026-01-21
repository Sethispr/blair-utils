Blair's build currently uses PNG which this site now auto compresses your final cards submissions using rust **oxipng** wasm. Soon the idea of using .webp is plausible considering its more optimized in compressing and can achieve lossless compressions as well (more detail on blairpng repo).

<div class="blair-container"><kbd><img
    src="https://raw.githubusercontent.com/Sethispr/blair-utils/main/src/IMG_7369.webp"
    alt="blair cards preview banner"
    class="blair-container__image"
  /></kbd>

This project is now hosted on cloudflare pages
  
https://sethispr.github.io/blair-utils/ is now used for testing

current major issues:

- introduces flickering (card appearing and disappearing when scrolling)

fixes:

- slow scrolling in android phones using chromium browsers

- more adaptive garbage collector

- now reuses and allocates basically the entire both canvas and offscreen canvas objects instead of always creating new ones

- more memory stability also helps minimzing gc pausing

- pooled all canvas bitmap allocations

- loading bar more believable instead of hanging since it counts from file size also adds a cancel button to stop process

- now caches the uploaded image in the local memory too so not only just text being saved

---
 
https://blairstudio.pages.dev/ production site

- performance score drops down to 92 in mobile devices

- scrolling in android mobile doesnt feel snappy

- no performance upgrades very leaky but has perfect first load times
