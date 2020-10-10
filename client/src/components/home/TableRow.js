import React from 'react';

function TableItem({ key, tag, trade }) {
    return (<tr key={key}>
                <td>{tag.tag}</td>
                <td>{new Date(trade.data.timestamp).toISOString()}</td>
                <td>{trade.input.s}</td>
                <td><b>{trade.input.c}</b></td>
                <td><b>{trade.input.t}</b></td>
                <td><code>{trade.data.price}</code></td>
                <td>{trade.input.tp === '0%'? '-' : trade.input.tp}</td>
                <td>{trade.input.t === 'M' ? '-' : trade.input.p}</td>
                <td>{trade.input.q}</td>
                <td>{trade.alias}</td>
            </tr>)
}

export default TableItem;