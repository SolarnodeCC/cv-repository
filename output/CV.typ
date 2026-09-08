// Import the rendercv function and all the refactored components
#import "@preview/rendercv:0.3.0": *

// Apply the rendercv template with custom configuration
#show: rendercv.with(
  name: "Jouw Naam",
  title: "CV",
  footer: context { [#emph[Jouw Naam -- #str(here().page())\/#str(counter(page).final().first())]] },
  top-note: [ #emph[Laatst bijgewerkt Sep 2026] ],
  locale-catalog-language: "nl",
  text-direction: ltr,
  page-size: "a4",
  page-top-margin: 1.4cm,
  page-bottom-margin: 1.4cm,
  page-left-margin: 1.4cm,
  page-right-margin: 1.4cm,
  page-show-footer: true,
  page-show-top-note: true,
  colors-body: rgb(20, 20, 20),
  colors-name: rgb(15, 48, 80),
  colors-headline: rgb(15, 48, 80),
  colors-connections: rgb(15, 48, 80),
  colors-section-titles: rgb(15, 48, 80),
  colors-links: rgb(180, 110, 25),
  colors-footer: rgb(120, 120, 120),
  colors-top-note: rgb(120, 120, 120),
  typography-line-spacing: 0.55em,
  typography-alignment: "justified-with-no-hyphenation",
  typography-date-and-location-column-alignment: right,
  typography-font-family-body: "Source Sans 3",
  typography-font-family-name: "Source Sans 3",
  typography-font-family-headline: "Source Sans 3",
  typography-font-family-connections: "Source Sans 3",
  typography-font-family-section-titles: "Source Sans 3",
  typography-font-size-body: 10pt,
  typography-font-size-name: 24pt,
  typography-font-size-headline: 11pt,
  typography-font-size-connections: 9.5pt,
  typography-font-size-section-titles: 1.2em,
  typography-small-caps-name: false,
  typography-small-caps-headline: false,
  typography-small-caps-connections: false,
  typography-small-caps-section-titles: false,
  typography-bold-name: true,
  typography-bold-headline: false,
  typography-bold-connections: false,
  typography-bold-section-titles: true,
  links-underline: false,
  links-show-external-link-icon: false,
  header-alignment: center,
  header-photo-width: 3.5cm,
  header-space-below-name: 0.7cm,
  header-space-below-headline: 0.7cm,
  header-space-below-connections: 0.7cm,
  header-connections-hyperlink: true,
  header-connections-show-icons: true,
  header-connections-display-urls-instead-of-usernames: false,
  header-connections-separator: "",
  header-connections-space-between-connections: 0.5cm,
  section-titles-type: "with_partial_line",
  section-titles-line-thickness: 0.5pt,
  section-titles-space-above: 0.45cm,
  section-titles-space-below: 0.25cm,
  sections-allow-page-break: true,
  sections-space-between-text-based-entries: 0.3em,
  sections-space-between-regular-entries: 1.2em,
  entries-date-and-location-width: 3.8cm,
  entries-side-space: 0.15cm,
  entries-space-between-columns: 0.15cm,
  entries-allow-page-break: false,
  entries-short-second-row: false,
  entries-degree-width: 1cm,
  entries-summary-space-left: 0cm,
  entries-summary-space-above: 0.05cm,
  entries-highlights-bullet:  "•" ,
  entries-highlights-nested-bullet:  "◦" ,
  entries-highlights-space-left: 0cm,
  entries-highlights-space-above: 0.05cm,
  entries-highlights-space-between-items: 0cm,
  entries-highlights-space-between-bullet-and-text: 0.5em,
  date: datetime(
    year: 2026,
    month: 9,
    day: 8,
  ),
)


= Jouw Naam

  #headline([Software Engineer])

#connections(
  [#connection-with-icon("location-dot")[Amsterdam, Nederland]],
  [#link("mailto:info@solarnode.cc", icon: false, if-underline: false, if-color: false)[#connection-with-icon("envelope")[info\@solarnode.cc]]],
  [#link("tel:+31-6-12345678", icon: false, if-underline: false, if-color: false)[#connection-with-icon("phone")[06 12345678]]],
  [#link("https://solarnode.cc/", icon: false, if-underline: false, if-color: false)[#connection-with-icon("link")[solarnode.cc]]],
  [#link("https://github.com/SolarnodeCC", icon: false, if-underline: false, if-color: false)[#connection-with-icon("github")[SolarnodeCC]]],
  [#link("https://linkedin.com/in/solarnode", icon: false, if-underline: false, if-color: false)[#connection-with-icon("linkedin")[solarnode]]],
)

// Solarnode accent rule under the header contact line
#v(0.15cm)
#line(length: 100%, stroke: 0.7pt + rgb(180, 110, 25))
#v(0.05cm)


== Profiel

Software engineer met focus op betrouwbare backends, CI\/CD en developer tooling. Levert reproduceerbare pipelines en duidelijke documentatie zodat teams sneller kunnen shippen zonder in te leveren op kwaliteit.

== Werkervaring

#regular-entry(
  [
    #strong[Solarnode], Software Engineer

    #summary[Bouwen en onderhouden van softwareproducten en interne developer tooling.]

  ],
  [
    Remote \/ NL

    Jan 2024 – heden

  ],
  main-column-second-row: [
    - YAML→PDF CV-pipeline opgezet (RenderCV + Typst); buildtijd \< 2s, 100\% reproduceerbaar via CI

    - GitHub Actions validatie + artifact-publicatie geautomatiseerd; 0 handmatige release-stappen

    - Documentatie en lokale make-workflows geschreven; onboarding nieuwe contributors \~30\% sneller

  ],
)

#regular-entry(
  [
    #strong[Voorbeeld Bedrijf], Junior Developer

    - Features geleverd in productie-codebase; \~8 PRs\/sprint met code review

  ],
  [
    Nederland

    Sep 2022 – Dec 2023

  ],
  main-column-second-row: [
    - Unit- en integratietests uitgebreid; coverage van kritieke modules +15\%

    - Samenwerking met product en design in 2-weekse sprints

  ],
)

== Opleiding

#education-entry(
  [
    #strong[Voorbeeld Hogeschool \/ Universiteit], Informatica

    - Afstudeerproject: beschrijf hier kort het resultaat en de gemeten impact

  ],
  [
    Nederland

    Sep 2018 – Jun 2022

  ],
  degree-column: [
    #strong[BSc]
  ],
  main-column-second-row: [
    - Relevante vakken: algoritmen, databases, netwerken, software engineering

  ],
)

== Projecten

#regular-entry(
  [
    #strong[cv-repository]

    #summary[Open YAML-CV met custom theme, lokale build en CI.]

  ],
  [
    GitHub

    2026

  ],
  main-column-second-row: [
    - Custom Typst-theme solarnode naast cv.yaml

    - make render voor PDF\/PNG\/HTML; web editor met sollicitatie-check

    - GitHub Actions valideert YAML en publiceert artifacts

  ],
)

#regular-entry(
  [
    #strong[Ander project]

  ],
  [
    Jan 2023 – Jun 2023

  ],
  main-column-second-row: [
    #summary[Korte beschrijving van een side project of open-source bijdrage.]

    - Tech stack en impact hier (gebruikers, latency, kosten, …)

  ],
)

== Vaardigheden

#strong[Talen:] Python, TypeScript, SQL

#strong[Tools:] Git, GitHub Actions, Docker, RenderCV, Typst

#strong[Praktijk:] CI\/CD, code review, technische documentatie, observability

== Talen

#strong[Nederlands:] Moedertaal (C2)

#strong[Engels:] Professioneel (C1)

== Certificeringen

#regular-entry(
  [
    #strong[Voorbeeld certificaat (AWS \/ Azure \/ Scrumban)]

  ],
  [
    2025

  ],
  main-column-second-row: [
  ],
)
