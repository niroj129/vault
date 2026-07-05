"use client";

import Crud from "../../../components/admin/Crud";

export default function AdminFaq() {
  return (
    <Crud
      title="FAQs" addLabel="Add FAQ" endpoint="/faqs/"
      columns={[
        { key: "question", label: "Question", render: (r) => <b>{r.question}</b> },
        { key: "category", label: "Category" },
        { key: "sort_order", label: "Order" },
      ]}
      fields={[
        { name: "question", label: "Question", required: true, full: true },
        { name: "answer", label: "Answer", type: "textarea", full: true },
        { name: "category", label: "Category" },
        { name: "sort_order", label: "Sort order", type: "number" },
      ]}
      defaults={{ category: "General", sort_order: 0 }}
    />
  );
}
