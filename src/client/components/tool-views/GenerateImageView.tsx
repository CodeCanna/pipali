// Generate image tool result view

import { parseMultimodalContent } from '../../utils/toolStatus';

interface GenerateImageViewProps {
    result: string;
}

export function GenerateImageView({ result }: GenerateImageViewProps) {
    const multimodal = parseMultimodalContent(result);
    const imageItem = multimodal?.find(c => c.type === 'image' && c.data && c.mime_type);
    const textContent = multimodal
        ?.filter(c => c.type === 'text').map(c => c.text).filter(Boolean).join('\n')
        || (!imageItem ? result : '');

    return (
        <div className="thought-tool-result">
            {imageItem ? (
                <div className="read-file-image">
                    <img
                        src={`data:${imageItem.mime_type};base64,${imageItem.data}`}
                        alt={textContent || "Generated image"}
                        title={textContent || "Generated image"}
                    />
                </div>
            ) : textContent ? (
                <div className="tool-result-content">
                    {textContent.split('\n').map((line, idx) => (
                        <div key={idx} className="tool-result-line">{line || '\u00A0'}</div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
