import React, { useState } from 'react';
import './trade.css'

const Trade = ({ token, logout }) => {
    const [symbol, setSymbol] = useState('XBTUSD')
    const [command, setCommand] = useState('B')
    const [type, setType] = useState('M')
    const [tag, setTag] = useState('1M')
    const [tp, setTp] = useState('0%')
    const [price, setPrice] = useState('1%')
    const [quantity, setQuantity] = useState('0.01XBT')
    const [account, setAccount] = useState('Test123')
    const [code, setCode] = useState('')

    const onChange = (e) => {
        const v = e.target.value
        switch(e.target.name) {
            case 's':
                setSymbol(v)
                break;
            case 'c':
                setCommand(v)
                break;
            case 't':
                setType(v)
                break;
            case 'tag':
                setTag(v)
                break;
            case 'tp':
                setTp(v)
                break;
            case 'p':
                setPrice(v)
                break;
            case 'q':
                setQuantity(v)
                break;
            case 'a':
                setAccount(v)
                break;
            case 'code':
                setCode(v)
                break;
            default:
                break;            
        }
    }

    // const createRow = () => {
    //     return (
    //         <tr>
    //             <td>{(new Date()).toUTCString()}</td>
    //             <td>{model.s}</td>
    //             <td>{model.c}</td>
    //             <td>{model.t}</td>
    //             <td>{model.tag}</td>
    //             <td>{model.tp}</td>
    //             <td>{model.p}</td>
    //             <td>{model.q}</td>
    //             <td>{model.a}</td>
    //         </tr>
    //     )
    // }

    const onSubmit = (e) => {
        e.preventDefault();
        // console.log(e.target.value)

        const data = {
            s: symbol,
            c: command,
            t: type,
            tag: tag,
            tp: tp,
            p: price,
            q: quantity,
            a: account,
            code: code
        }

        console.log('Submitting form and waiting for response..')
        fetch('/ccxt', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authentication': token
            },
            body: JSON.stringify(data)
        }).then((response) => {
            console.log('Post Submission Response: ', response)
        }).catch(e => {
            alert(`Error using post form: ${e}`)
        })
    }
    
    //Validation
    // const sValues = ['XBTUSD','XRPUSD','ETHUSD']
    // const cValues = ['B','S','CL','CS']
    // const tValues = ['M','L']
    // const tagReg = /^[0-9]{1,}M$/
    // const tpReg = /^[0-9]{1,}%$|^[0-9]{1,5}\.[0-9]{1,3}%$/
    // const pReg = /^[0-9]{1,}%$|^[0-9]{1,5}\.[0-9]{1,3}%$/
    // const qReg = /^[0-9]{1,}XBT$|^[0-9]{1,5}\.[0-9]{1,4}XBT$|^auto$/
    // const aReg = /^[A-Za-z0-9]{3,}$/
    // const codeReg = /^[0-9]{5}$/

    // console.log(sValues.includes(s))
    // console.log(cValues.includes(c))
    // console.log(tValues.includes(t))
    // console.log(tagReg.test(tag))
    // console.log(tpReg.test(tp))
    // console.log(pReg.test(p))
    // console.log(qReg.test(q))
    // console.log(aReg.test(a))
    // console.log(codeReg.test(code))

    // if(!(sValues.includes(s) && cValues.includes(c) && tValues.includes(t) &&
    //     tagReg.test(tag) && tpReg.test(tp) && pReg.test(p) && qReg.test(q) && 
    //     aReg.test(a) && codeReg.test(code))
    // ) {
    //     alert('Check your values before submitting!')
    //     return
    // }

    return (
        <div className='trade-container'>
            <div className="title">
                <h1>CCXT Bitmex POST-Form - Send your trades straight to Bitmex from here!</h1>
                <p>Alpha V0.2</p>
            </div>
            <form id="form">
                <div className="form-group">
                    <div>
                        <label htmlFor="s">Symbol ['XBTUSD','XRPUSD','ETHUSD']:</label><br/>
                        <input type="text" placeholder="s" name="s" value={symbol} onChange={onChange}/>
                    </div>
                    <div>
                        <label htmlFor="c">Order ['S','B','CL' or 'CS']:</label><br/>
                        <input type="text" placeholder="c" name="c" value={command} onChange={onChange}/>
                    </div>
                    <div>
                        <label htmlFor="t">Type ['M' or 'L']:</label><br/>
                        <input type="text" placeholder="t" name="t" value={type} onChange={onChange}/>
                    </div>
                    <div>
                        <label htmlFor="tag">Tag [Timeframe]:</label><br/>
                        <input type="text" placeholder="tag" name="tag" value={tag} onChange={onChange}/>
                    </div>
                </div>
                <div className="form-group">
                    <div>
                        <label htmlFor="tp">TP [Target Percentage%]:</label><br/>
                        <input type="text" placeholder="tp" name="tp" value={tp} onChange={onChange}/>
                    </div>
                    <div>
                        <label htmlFor="p">Price [Offset Percentage%]:</label><br/>
                        <input type="text" placeholder="p" name="p" value={price} onChange={onChange}/>
                    </div>
                    <div>
                        <label htmlFor="q">Quantity ['#amountUSD']:</label><br/>
                        <input type="text" placeholder="q" name="q" value={quantity} onChange={onChange}/>
                    </div>
                    <div>
                        <label htmlFor="a">Account [Username]:</label><br/>
                        <input type="text" placeholder="a" name="a" value={account} onChange={onChange}/>
                    </div>
                    <div>
                        <label htmlFor="code">Access Code:</label><br/>
                        <input type="text" placeholder="code" name="code" value={code} onChange={onChange}/>
                    </div>
                    <div className='buttons'>
                        <input type="submit" value="Submit" onClick={onSubmit}/>
                        <input type='submit' value='Logout' onClick={ logout }/>
                    </div>
                </div>
            </form>
            <br/><br/>
            <div className="table">
                <table style={{width:'100%', textAlign:'left'}} id="log">
                    <thead className="table-head">
                        <th>Date</th>
                        <th>Symbol</th>
                        <th>Side</th>
                        <th>Type</th>
                        <th>Tag</th>
                        <th>TP</th>
                        <th>P</th>
                        <th>Qnty</th>
                        <th>Account</th>
                    </thead>
                    <tbody>
                        {/*INSERT*/}
                        <tr>
                        <td>EXAMPLE</td>
                        <td>{symbol}</td>
                        <td>{command}</td>
                        <td>{type}</td>
                        <td>{tag}</td>
                        <td>{tp}</td>
                        <td>{price}</td>
                        <td>{quantity}</td>
                        <td>{account}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default Trade;