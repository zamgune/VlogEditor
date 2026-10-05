import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
import './captions.css';
import './narration.css';
import { renderCaption, renderCaptionScene } from './shared/caption-renderer';
if (location.hash === '#caption-renderer') window.captionRenderer = { bitmap: renderCaption, scene: renderCaptionScene };
else createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
