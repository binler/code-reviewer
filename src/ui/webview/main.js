(function () {
	const vscode = acquireVsCodeApi();
	const tabs = document.querySelectorAll(".nav-btn");
	tabs.forEach((btn) =>
		btn.addEventListener("click", () => {
			const id = btn.getAttribute("data-tab");
			document
				.querySelectorAll(".tab")
				.forEach((t) => t.classList.remove("active"));
			document.getElementById(id).classList.add("active");
		})
	);
	function renderSummary(summary) {
		const el = document.getElementById("summaryCard");
		if (!summary) {
			el.textContent = "Chưa có dữ liệu";
			return;
		}
		const s =
			typeof summary === "object"
				? summary
				: { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
		el.innerHTML = `<div>Issues: ${s.total}</div><div>Critical: ${s.critical} • High: ${s.high} • Medium: ${s.medium} • Low: ${s.low}</div>`;
	}
	window.addEventListener("message", (e) => {
		const m = e.data;
		if (!m || !m.type) return;
		if (m.type === "result" && m.payload && m.payload.summary) {
			renderSummary(m.payload.summary);
		}
	});
})();
