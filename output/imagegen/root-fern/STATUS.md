# Root and fern transition assets — complete

Generated with built-in imagegen using cave-office, recreation-night, and (for right) the left panel as style references. Source brief: assets/maps/atrium-root-fern-transition.prompt.md.

Original drafts are preserved as RGB PNG, 1086 x 1448. Their baked checkerboards were removed through user-authorized local processing. Final files are PNG RGBA, 1800 x 2400, under assets/transitions/root-fern-left.png and assets/transitions/root-fern-right.png. The size is resampled from the generated source, not native generated detail.

Completed: genuine transparent outside regions, antialiased foliage edges, no enclosed alpha pinholes, continuous fully opaque body across at least 80% width at every row, opaque outer edges and top/bottom across the coverage body. A piecewise horizontal remap expanded body coverage while retaining distinct left/right artwork. Edge colors were decontaminated from the gray backing.

Verification: alpha-validation.json records pixel-level results. alpha-coverage-proof.jpg shows individual panels over magenta/cyan and paired closed coverage at 390 x 844, 1920 x 1080, 3440 x 1440, and 844 x 390. Each closed viewport contains zero pixels below alpha 255. Visual QA confirmed readable silhouettes and no checkerboard backing. Artwork delivery is complete; runtime animation/integration was not part of this asset task.

Reproduce with finish_panels.py using Python, Pillow, NumPy and SciPy. It recreates final assets and QA artifacts from the preserved drafts.
