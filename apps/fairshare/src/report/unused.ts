// Stands in for jsPDF's optional HTML and SVG helpers (html2canvas, dompurify, canvg). The report never calls them,
// and bundling them would add about 380 KB to what every phone downloads and caches.
export default undefined;
