import { BrowserRouter, Route, Routes } from 'react-router';
import { RunExplorer } from '@/pages/RunExplorer';
import { RunDetail } from '@/pages/RunDetail';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RunExplorer />} />
        <Route path="/runs/:workflowId" element={<RunDetail />} />
      </Routes>
    </BrowserRouter>
  );
}
