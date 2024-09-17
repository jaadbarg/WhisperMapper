import React, { useEffect, useState } from "react";
import mermaid from "mermaid";

const Mermaid = ({ chart, onError }) => {
  const [svgContent, setSvgContent] = useState("");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return; // Check for server-side rendering

    mermaid.initialize({
      startOnLoad: true,
      theme: "default",
      securityLevel: "loose",
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: "basis",
      },
    });

    const renderChart = async () => {
      if (chart) {
        setIsLoading(true);
        setError(null);
        try {
          const { svg } = await mermaid.render("mermaid-svg", chart);
          setSvgContent(svg);
          if (onError) onError(null);
        } catch (err) {
          console.error("Mermaid rendering error:", err);
          setError("Temporary rendering issue. The chart will update shortly.");
          if (onError) onError(err);
          setSvgContent("");
        } finally {
          setIsLoading(false);
        }
      }
    };

    renderChart();
  }, [chart, onError]);

  if (isLoading) {
    return <div>Rendering chart...</div>;
  }

  if (error) {
    return <div className="text-yellow-600">{error}</div>;
  }

  return <div dangerouslySetInnerHTML={{ __html: svgContent }} />;
};

export default Mermaid;
